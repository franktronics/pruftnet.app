import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

import { drizzle } from 'drizzle-orm/node-sqlite'
import { migrate } from 'drizzle-orm/node-sqlite/migrator'
import { Context, Effect, Layer } from 'effect'

import { AppDataPaths } from './app-data-paths'
import { DatabaseError } from './errors'
import { InstanceLock } from './instance-lock'
import { SummaryQueryWorker, type SummaryIndexQuery, type SummaryIndexResult } from './query-worker'

export type DrizzleDatabase = ReturnType<typeof drizzle>

export interface DatabaseService {
    readonly summaryIndex: (
        query: SummaryIndexQuery,
    ) => Effect.Effect<SummaryIndexResult, DatabaseError>
    readonly read: <A>(
        operation: string,
        use: (database: DrizzleDatabase) => A,
    ) => Effect.Effect<A, DatabaseError>
    readonly write: <A>(
        operation: string,
        use: (database: DrizzleDatabase) => A,
    ) => Effect.Effect<A, DatabaseError>
}

export interface DatabaseLayerOptions {
    readonly migrationsFolder?: string
}

function databaseFailure(operation: string, cause: unknown) {
    return new DatabaseError({
        operation,
        message: `SQLite operation failed: ${operation}`,
        cause,
    })
}

export class Database extends Context.Tag('@repo/core/storage/Database')<
    Database,
    DatabaseService
>() {
    static layerWith(options: DatabaseLayerOptions = {}) {
        return Layer.scoped(
            Database,
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                yield* InstanceLock
                const database = yield* Effect.acquireRelease(
                    Effect.try({
                        try: () => {
                            let connection: DatabaseSync | undefined
                            try {
                                connection = new DatabaseSync(paths.databasePath, {
                                    enableForeignKeyConstraints: true,
                                    enableDoubleQuotedStringLiterals: false,
                                    timeout: 5_000,
                                    readBigInts: true,
                                })
                                connection.exec('PRAGMA journal_mode = WAL')
                                connection.exec('PRAGMA foreign_keys = ON')
                                connection.exec('PRAGMA busy_timeout = 5000')
                                const database = drizzle({ client: connection })
                                migrate(database, {
                                    migrationsFolder:
                                        options.migrationsFolder ??
                                        process.env.PRUFTNET_MIGRATIONS_DIR ??
                                        fileURLToPath(new URL('../../drizzle', import.meta.url)),
                                    migrationsTable: 'schema_migrations',
                                })
                                const integrity = connection
                                    .prepare('PRAGMA integrity_check')
                                    .get() as Record<string, SQLInputValue> | undefined
                                if (!integrity || Object.values(integrity)[0] !== 'ok') {
                                    throw new Error('SQLite integrity check failed.')
                                }
                                return { connection, database }
                            } catch (cause) {
                                connection?.close()
                                throw cause
                            }
                        },
                        catch: (cause) => databaseFailure('open and migrate', cause),
                    }),
                    ({ connection }) =>
                        Effect.sync(() => {
                            connection.exec('PRAGMA wal_checkpoint(TRUNCATE)')
                            connection.close()
                        }).pipe(Effect.orDie),
                )
                const run = <A>(operation: string, use: (connection: DrizzleDatabase) => A) =>
                    Effect.try({
                        try: () => use(database.database),
                        catch: (cause) => databaseFailure(operation, cause),
                    })
                const queryWorker = yield* Effect.acquireRelease(
                    Effect.sync(() => new SummaryQueryWorker(paths.databasePath)),
                    (worker) => Effect.promise(() => worker.close()),
                )
                const queryPermit = yield* Effect.makeSemaphore(1)
                return Database.of({
                    summaryIndex: (query) =>
                        queryPermit.withPermits(1)(
                            Effect.tryPromise({
                                try: (signal) => queryWorker.query(query, signal),
                                catch: (cause) => databaseFailure('index packet summaries', cause),
                            }),
                        ),
                    read: run,
                    write: run,
                })
            }),
        )
    }

    static readonly layer = Database.layerWith()
}

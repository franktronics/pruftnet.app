import { DatabaseSync } from 'node:sqlite'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { count, eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Cause, Effect, Exit, Layer, Scope } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import {
    AppDataPaths,
    captureSessions,
    captureSummaries,
    Database,
    InstanceLock,
    type AppDataPathsOptions,
} from './index'

const schemaMigrations = sqliteTable('schema_migrations', {
    id: integer().primaryKey({ autoIncrement: true }),
    hash: text().notNull(),
    createdAt: integer('created_at').notNull(),
})

const roots: Array<string> = []
const migrationsRoot = resolve(process.cwd(), 'drizzle')
const summaryIndexMigration = '20260720072512_plain_serpent_society'

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function storageLayer(options: AppDataPathsOptions, migrationsFolder?: string) {
    const paths = AppDataPaths.layer(options)
    const lock = InstanceLock.layer.pipe(Layer.provide(paths))
    return Database.layerWith({ migrationsFolder }).pipe(Layer.provide(Layer.merge(paths, lock)))
}

async function testRoot() {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-database-'))
    roots.push(root)
    return root
}

describe('Database', () => {
    test('backfills dense summary indexes for captures created before virtual history', async () => {
        const root = await testRoot()
        const oldMigrations = join(root, 'old-migrations')
        await mkdir(oldMigrations)
        for (const entry of await readdir(migrationsRoot, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name >= summaryIndexMigration) continue
            await cp(join(migrationsRoot, entry.name), join(oldMigrations, entry.name), {
                recursive: true,
            })
        }
        const options: AppDataPathsOptions = {
            runtime: 'test',
            environment: 'test',
            dataRoot: root,
        }
        await Effect.runPromise(
            Database.pipe(Effect.scoped, Effect.provide(storageLayer(options, oldMigrations))),
        )
        const captureId = 'b'.repeat(32)
        const legacy = new DatabaseSync(join(root, 'pruftnet.sqlite'))
        legacy
            .prepare(
                `insert into capture_sessions (
                    id, state, source_json, interface_count, source_format, started_at_ns,
                    stopped_at_ns, summary_cursor, created_at_ns, updated_at_ns
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
                captureId,
                'stopped',
                JSON.stringify({ _tag: 'Replay', fileId: 'legacy' }),
                1,
                'pcapng',
                '1',
                '2',
                '10',
                '1',
                '2',
            )
        const insertSummary = legacy.prepare(
            `insert into capture_summaries (
                capture_id, cursor, packet_id, summary_json
            ) values (?, ?, ?, ?)`,
        )
        insertSummary.run(captureId, '10', '10', '{}')
        insertSummary.run(captureId, '2', '2', '{}')
        legacy.close()

        const migrated = await Effect.runPromise(
            Effect.gen(function* () {
                const database = yield* Database
                return yield* database.read('read migrated summary indexes', (connection) => ({
                    session: connection
                        .select({ summaryCount: captureSessions.summaryCount })
                        .from(captureSessions)
                        .where(eq(captureSessions.id, captureId))
                        .get(),
                    summaries: connection
                        .select({
                            cursor: captureSummaries.cursor,
                            rowIndex: captureSummaries.rowIndex,
                        })
                        .from(captureSummaries)
                        .where(eq(captureSummaries.captureId, captureId))
                        .orderBy(captureSummaries.rowIndex)
                        .all(),
                }))
            }).pipe(Effect.scoped, Effect.provide(storageLayer(options))),
        )

        expect(migrated.session?.summaryCount).toBe('2')
        expect(
            migrated.summaries.map((summary) => ({
                cursor: summary.cursor,
                rowIndex: Number(summary.rowIndex),
            })),
        ).toEqual([
            { cursor: '2', rowIndex: 0 },
            { cursor: '10', rowIndex: 1 },
        ])
    })

    test('migrates on first use and reopens without reapplying migrations', async () => {
        const root = await testRoot()
        const options: AppDataPathsOptions = {
            runtime: 'test',
            environment: 'test',
            dataRoot: root,
        }
        const readVersions = Database.pipe(
            Effect.flatMap((database) =>
                database.read('read schema versions', (connection) =>
                    connection.select().from(schemaMigrations).all(),
                ),
            ),
            Effect.scoped,
            Effect.provide(storageLayer(options)),
        )

        const first = await Effect.runPromise(readVersions)
        const second = await Effect.runPromise(readVersions)
        expect(first.length).toBeGreaterThan(0)
        expect(second).toEqual(first)
    })

    test('persists captures when switching from desktop to server', async () => {
        const workspaceRoot = await testRoot()
        const captureId = 'a'.repeat(32)
        const desktop = storageLayer({
            runtime: 'desktop',
            environment: 'development',
            workspaceRoot,
        })
        const server = storageLayer({
            runtime: 'server',
            environment: 'development',
            workspaceRoot,
        })

        await Effect.runPromise(
            Effect.gen(function* () {
                const database = yield* Database
                yield* database.write('insert desktop capture', (connection) =>
                    connection
                        .insert(captureSessions)
                        .values({
                            id: captureId,
                            state: 'stopped',
                            sourceJson: {},
                            interfaceCount: 1,
                            sourceFormat: 'pcapng',
                            startedAtNs: '1',
                            stoppedAtNs: '2',
                            createdAtNs: '1',
                            updatedAtNs: '2',
                        })
                        .run(),
                )
            }).pipe(Effect.scoped, Effect.provide(desktop)),
        )

        const captures = await Effect.runPromise(
            Database.pipe(
                Effect.flatMap((database) =>
                    database.read('read captures from server', (connection) =>
                        connection.select().from(captureSessions).all(),
                    ),
                ),
                Effect.scoped,
                Effect.provide(server),
            ),
        )

        expect(captures.map((capture) => capture.id)).toContain(captureId)
    })

    test('rolls back failed transactions', async () => {
        const root = await testRoot()
        const layer = storageLayer({ runtime: 'test', environment: 'test', dataRoot: root })
        const program = Effect.gen(function* () {
            const database = yield* Database
            yield* database
                .write('invalid session insert', (connection) => {
                    connection.transaction((transaction) => {
                        transaction
                            .insert(captureSessions)
                            .values({
                                id: 'invalid',
                                state: 'preparing',
                                sourceJson: {},
                                interfaceCount: 1,
                                sourceFormat: 'pcapng',
                                startedAtNs: '1',
                                createdAtNs: '1',
                                updatedAtNs: '1',
                            })
                            .run()
                    })
                })
                .pipe(Effect.ignore)
            return yield* database.read('count sessions', (connection) =>
                connection.select({ count: count() }).from(captureSessions).get(),
            )
        }).pipe(Effect.scoped, Effect.provide(layer))

        await expect(Effect.runPromise(program)).resolves.toEqual({ count: 0 })
    })

    test('refuses a corrupt database instead of recreating it', async () => {
        const root = await testRoot()
        await writeFile(join(root, 'pruftnet.sqlite'), 'not a sqlite database')
        const program = Database.pipe(
            Effect.scoped,
            Effect.provide(storageLayer({ runtime: 'test', environment: 'test', dataRoot: root })),
        )

        const exit = await Effect.runPromiseExit(program)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain('DatabaseError')
        const { readFile } = await import('node:fs/promises')
        await expect(readFile(join(root, 'pruftnet.sqlite'), 'utf8')).resolves.toBe(
            'not a sqlite database',
        )
    })

    test('rejects a server instance while desktop owns the shared root', async () => {
        const workspaceRoot = await testRoot()
        const desktop: AppDataPathsOptions = {
            runtime: 'desktop',
            environment: 'development',
            workspaceRoot,
        }
        const server: AppDataPathsOptions = {
            runtime: 'server',
            environment: 'development',
            workspaceRoot,
        }
        const firstScope = await Effect.runPromise(Scope.make())
        await Effect.runPromise(Layer.buildWithScope(storageLayer(desktop), firstScope))

        const exit = await Effect.runPromiseExit(
            Database.pipe(Effect.scoped, Effect.provide(storageLayer(server))),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain('InstanceLockError')

        await Effect.runPromise(Scope.close(firstScope, Exit.succeed(undefined)))
    })

    test('enforces one active capture and preserves UInt64 text exactly', async () => {
        const root = await testRoot()
        const layer = storageLayer({ runtime: 'test', environment: 'test', dataRoot: root })
        const maximumUInt64 = '18446744073709551615'
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const database = yield* Database
                yield* database.write('insert first active capture', (connection) =>
                    connection
                        .insert(captureSessions)
                        .values({
                            id: 'a'.repeat(32),
                            state: 'capturing',
                            sourceJson: {},
                            interfaceCount: 1,
                            sourceFormat: 'pcapng',
                            startedAtNs: '1',
                            packetCount: maximumUInt64,
                            createdAtNs: '1',
                            updatedAtNs: '1',
                        })
                        .run(),
                )
                const second = yield* database
                    .write('insert second active capture', (connection) =>
                        connection
                            .insert(captureSessions)
                            .values({
                                id: 'b'.repeat(32),
                                state: 'preparing',
                                sourceJson: {},
                                interfaceCount: 1,
                                sourceFormat: 'pcapng',
                                startedAtNs: '2',
                                createdAtNs: '2',
                                updatedAtNs: '2',
                            })
                            .run(),
                    )
                    .pipe(Effect.exit)
                const stored = yield* database.read('read UInt64 counter', (connection) =>
                    connection
                        .select({ packetCount: captureSessions.packetCount })
                        .from(captureSessions)
                        .get(),
                )
                return { second, stored }
            }).pipe(Effect.scoped, Effect.provide(layer)),
        )

        expect(Exit.isFailure(result.second)).toBe(true)
        expect(result.stored?.packetCount).toBe(maximumUInt64)
    })
})

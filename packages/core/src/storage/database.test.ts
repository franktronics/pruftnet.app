import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { count } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Cause, Effect, Exit, Layer, Scope } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import {
    AppDataPaths,
    captureSessions,
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

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function storageLayer(options: AppDataPathsOptions) {
    const paths = AppDataPaths.layer(options)
    const lock = InstanceLock.layer.pipe(Layer.provide(paths))
    return Database.layer.pipe(Layer.provide(Layer.merge(paths, lock)))
}

async function testRoot() {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-database-'))
    roots.push(root)
    return root
}

describe('Database', () => {
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

    test('rejects a second live instance for the same data root', async () => {
        const root = await testRoot()
        const options: AppDataPathsOptions = {
            runtime: 'test',
            environment: 'test',
            dataRoot: root,
        }
        const firstScope = await Effect.runPromise(Scope.make())
        await Effect.runPromise(Layer.buildWithScope(storageLayer(options), firstScope))

        const exit = await Effect.runPromiseExit(
            Database.pipe(Effect.scoped, Effect.provide(storageLayer(options))),
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

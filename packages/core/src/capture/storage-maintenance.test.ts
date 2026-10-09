import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { ResetCaptureStorageRequest } from '@repo/shared/capture'
import { count } from 'drizzle-orm'
import { Deferred, Effect, Exit, Fiber, Layer } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { AppDataPaths, captureSessions, captureSummaries, Database } from '#core/storage'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureCatalog } from './catalog'
import { ExportScheduler } from './export-scheduler'
import { CaptureSessionManager } from './manager'
import { CaptureStorageMaintenance } from './storage-maintenance'
import {
    addSegment,
    cleanupDurableRoots,
    durableLayer,
    source,
    stopCapture,
    summary,
} from './test-fixtures/durable-store'

afterEach(cleanupDurableRoots)

const firstId = 'a'.repeat(32)
const secondId = 'b'.repeat(32)

async function maintenanceLayer(exportsCleared: Effect.Effect<void> = Effect.void) {
    const durable = await durableLayer()
    const calls = { stop: 0, clear: 0 }
    const manager = Layer.effect(
        CaptureSessionManager,
        Effect.gen(function* () {
            const captures = yield* CaptureSessionRepository
            return CaptureSessionManager.of({
                stop: (captureId: string) =>
                    Effect.gen(function* () {
                        calls.stop += 1
                        yield* captures.transition(captureId, 'stopping')
                        yield* captures.transition(captureId, 'stopped', { stoppedAtNs: '9' })
                    }).pipe(Effect.orDie),
            } as never)
        }),
    ).pipe(Layer.provide(durable))
    const scheduler = Layer.succeed(
        ExportScheduler,
        ExportScheduler.of({
            clear: () =>
                Effect.sync(() => {
                    calls.clear += 1
                }).pipe(Effect.zipRight(exportsCleared)),
        } as never),
    )
    const layer = CaptureStorageMaintenance.layer.pipe(
        Layer.provideMerge(Layer.mergeAll(durable, manager, scheduler)),
    )
    return { layer, calls }
}

const rowCounts = Effect.gen(function* () {
    const database = yield* Database
    return yield* database.read('count rows', (db) => ({
        sessions: Number(db.select({ value: count() }).from(captureSessions).get()?.value),
        summaries: Number(db.select({ value: count() }).from(captureSummaries).get()?.value),
    }))
})

const storedCapture = Effect.fn('test.storedCapture')(function* (captureId: string) {
    const captures = yield* CaptureSessionRepository
    yield* stopCapture(captureId)
    yield* addSegment(captureId, 4096)
    yield* captures.persistSummaries(captureId, [summary(captureId, '1'), summary(captureId, '2')])
})

describe('capture storage maintenance', () => {
    test('deletes every capture, its analysis rows, and unreferenced files', async () => {
        const { layer, calls } = await maintenanceLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                const maintenance = yield* CaptureStorageMaintenance
                yield* storedCapture(firstId)
                yield* storedCapture(secondId)
                const orphan = join(paths.exportsRoot, 'c'.repeat(32))
                yield* Effect.promise(() => mkdir(orphan, { recursive: true }))
                const before = yield* maintenance.usage()
                const reset = yield* maintenance.reset(
                    new ResetCaptureStorageRequest({ stopActiveCapture: false }),
                )
                return {
                    before,
                    reset,
                    rows: yield* rowCounts,
                    capturesLeft: existsSync(paths.captureRoot(firstId)),
                    orphanLeft: existsSync(orphan),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.before.captureCount).toBe('2')
        expect(BigInt(result.before.captureBytes)).toBeGreaterThanOrEqual(8192n)
        expect(result.reset.deletedCaptures).toBe('2')
        expect(BigInt(result.reset.reclaimedBytes)).toBeGreaterThan(0n)
        expect(result.reset.usage).toMatchObject({
            captureCount: '0',
            captureBytes: '0',
            exportBytes: '0',
        })
        expect(result.rows).toEqual({ sessions: 0, summaries: 0 })
        expect(result.capturesLeft).toBe(false)
        expect(result.orphanLeft).toBe(false)
        expect(calls.clear).toBe(1)
    })

    test('refuses an active capture unless asked to stop it first', async () => {
        const { layer, calls } = await maintenanceLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const captures = yield* CaptureSessionRepository
                const maintenance = yield* CaptureStorageMaintenance
                yield* captures.create(firstId, source)
                yield* captures.transition(firstId, 'capturing', { registryRevision: '1' })
                const refused = yield* maintenance
                    .reset(new ResetCaptureStorageRequest({ stopActiveCapture: false }))
                    .pipe(Effect.flip)
                const retained = yield* maintenance.usage()
                const reset = yield* maintenance.reset(
                    new ResetCaptureStorageRequest({ stopActiveCapture: true }),
                )
                return { refused, retained, reset }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.refused._tag).toBe('CaptureInUse')
        expect(result.retained.captureCount).toBe('1')
        expect(result.reset.deletedCaptures).toBe('1')
        expect(calls.stop).toBe(1)
    })

    test('rejects storage mutations while a reset owns the store', async () => {
        const entered = Effect.runSync(Deferred.make<void>())
        const release = Effect.runSync(Deferred.make<void>())
        const { layer } = await maintenanceLayer(
            Deferred.succeed(entered, undefined).pipe(Effect.zipRight(Deferred.await(release))),
        )
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const maintenance = yield* CaptureStorageMaintenance
                const reset = yield* Effect.fork(
                    maintenance.reset(new ResetCaptureStorageRequest({ stopActiveCapture: false })),
                )
                yield* Deferred.await(entered)
                const during = yield* Effect.exit(maintenance.guardMutation(Effect.succeed(1)))
                const concurrentReset = yield* Effect.exit(
                    maintenance.reset(new ResetCaptureStorageRequest({ stopActiveCapture: false })),
                )
                yield* Deferred.succeed(release, undefined)
                yield* Fiber.join(reset)
                const after = yield* maintenance.guardMutation(Effect.succeed(2))
                return { during, concurrentReset, after }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(Exit.isFailure(result.during)).toBe(true)
        expect(Exit.isFailure(result.concurrentReset)).toBe(true)
        expect(result.after).toBe(2)
    })

    test('purges tombstones left by deletions that kept segment rows', async () => {
        const { layer } = await maintenanceLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const catalog = yield* CaptureCatalog
                const maintenance = yield* CaptureStorageMaintenance
                yield* storedCapture(firstId)
                yield* catalog.delete(firstId)
                // Deletions before analysis-row cleanup left segment rows behind.
                yield* addSegment(firstId)
                const reset = yield* maintenance.reset(
                    new ResetCaptureStorageRequest({ stopActiveCapture: false }),
                )
                return { reset, rows: yield* rowCounts }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.reset.usage.captureCount).toBe('0')
        expect(result.rows).toEqual({ sessions: 0, summaries: 0 })
    })

    test('drops analysis rows when a single capture is deleted', async () => {
        const { layer } = await maintenanceLayer()
        const rows = await Effect.runPromise(
            Effect.gen(function* () {
                const catalog = yield* CaptureCatalog
                yield* storedCapture(firstId)
                yield* catalog.delete(firstId)
                return yield* rowCounts
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        // The tombstone remains until a full reset purges it.
        expect(rows).toEqual({ sessions: 1, summaries: 0 })
    })
})

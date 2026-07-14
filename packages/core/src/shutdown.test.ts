import { Effect, Layer } from 'effect'
import { describe, expect, test } from 'vitest'

import { CaptureCatalog } from './capture/catalog'
import { ExportScheduler } from './capture/export-scheduler'
import { CaptureSessionManager } from './capture/manager'
import { ShutdownCoordinator } from './shutdown'

function testLayer() {
    const calls = { stop: 0, cancelAll: 0, interruptAll: 0 }
    const catalog = CaptureCatalog.of({
        list: () => Effect.die('unused'),
        get: () => Effect.die('unused'),
        active: () => Effect.succeed({ captureId: 'a'.repeat(32) } as never),
        open: () => Effect.die('unused'),
        delete: () => Effect.die('unused'),
        finalizeDeferred: () => Effect.die('unused'),
    })
    const manager = CaptureSessionManager.of({
        listInterfaces: () => Effect.die('unused'),
        capabilities: () => Effect.die('unused'),
        start: () => Effect.die('unused'),
        stop: () =>
            Effect.sync(() => {
                calls.stop += 1
                return {} as never
            }),
        session: () => Effect.die('unused'),
        summaries: () => Effect.die('unused'),
        registry: () => Effect.die('unused'),
        detail: () => Effect.die('unused'),
        stats: () => Effect.die('unused'),
        statSamples: () => Effect.die('unused'),
        events: () => Effect.die('unused'),
    })
    const scheduler = ExportScheduler.of({
        create: () => Effect.die('unused'),
        get: () => Effect.die('unused'),
        list: () => Effect.die('unused'),
        cancel: () => Effect.die('unused'),
        retry: () => Effect.die('unused'),
        deleteArtifact: () => Effect.die('unused'),
        cancelAll: () =>
            Effect.sync(() => {
                calls.cancelAll += 1
            }),
        interruptAll: () =>
            Effect.sync(() => {
                calls.interruptAll += 1
            }),
        status: () => Effect.succeed({ activeExportIds: ['export'] }),
    })
    const dependencies = Layer.mergeAll(
        Layer.succeed(CaptureCatalog, catalog),
        Layer.succeed(CaptureSessionManager, manager),
        Layer.succeed(ExportScheduler, scheduler),
    )
    return { calls, layer: ShutdownCoordinator.layer.pipe(Layer.provide(dependencies)) }
}

describe('ShutdownCoordinator', () => {
    test('stops capture, cancels Desktop exports, and remains idempotent', async () => {
        const { calls, layer } = testLayer()
        const accepting = await Effect.runPromise(
            Effect.gen(function* () {
                const shutdown = yield* ShutdownCoordinator
                yield* Effect.all([shutdown.shutdownDesktop(), shutdown.shutdownDesktop()], {
                    concurrency: 'unbounded',
                })
                return yield* Effect.exit(shutdown.assertAcceptingMutations())
            }).pipe(Effect.provide(layer)),
        )

        expect(calls).toEqual({ stop: 1, cancelAll: 1, interruptAll: 0 })
        expect(accepting._tag).toBe('Failure')
    })

    test('stops capture and interrupts Server exports', async () => {
        const { calls, layer } = testLayer()
        await Effect.runPromise(
            Effect.gen(function* () {
                yield* (yield* ShutdownCoordinator).shutdownServer()
            }).pipe(Effect.provide(layer)),
        )

        expect(calls).toEqual({ stop: 1, cancelAll: 0, interruptAll: 1 })
    })
})

import { CaptureStorageUnavailable } from '@repo/shared/capture'
import { Context, Data, Effect, Layer } from 'effect'

import { CaptureCatalog } from './capture/catalog'
import { ExportScheduler } from './capture/export-scheduler'
import { CaptureSessionManager } from './capture/manager'
import { RealtimeHub } from './realtime/hub'

export class ShutdownError extends Data.TaggedError('ShutdownError')<{
    readonly message: string
    readonly cause?: unknown
}> {}

export interface ShutdownStatus {
    readonly captureId: string | null
    readonly activeExportIds: ReadonlyArray<string>
    readonly shuttingDown: boolean
}

export interface ShutdownCoordinatorService {
    readonly assertAcceptingMutations: () => Effect.Effect<void, CaptureStorageUnavailable>
    readonly status: () => Effect.Effect<ShutdownStatus, ShutdownError>
    readonly shutdownDesktop: () => Effect.Effect<void, ShutdownError>
    readonly shutdownServer: () => Effect.Effect<void, ShutdownError>
    readonly closeRealtime: () => Effect.Effect<void>
}

export class ShutdownCoordinator extends Context.Tag('@repo/core/ShutdownCoordinator')<
    ShutdownCoordinator,
    ShutdownCoordinatorService
>() {
    static readonly layer = Layer.effect(
        ShutdownCoordinator,
        Effect.gen(function* () {
            const catalog = yield* CaptureCatalog
            const manager = yield* CaptureSessionManager
            const exports = yield* ExportScheduler
            const realtime = yield* RealtimeHub
            const mutex = yield* Effect.makeSemaphore(1)
            let shuttingDown = false
            let completed = false

            const status = Effect.fn('ShutdownCoordinator.status')(function* () {
                const active = yield* catalog.active().pipe(
                    Effect.mapError(
                        (cause) =>
                            new ShutdownError({
                                message: 'Unable to inspect the active capture.',
                                cause,
                            }),
                    ),
                )
                const exportStatus = yield* exports.status()
                return {
                    captureId: active?.captureId ?? null,
                    activeExportIds: exportStatus.activeExportIds,
                    shuttingDown,
                }
            })

            const run = (mode: 'desktop' | 'server') =>
                mutex
                    .withPermits(1)(
                        Effect.gen(function* () {
                            if (completed) return
                            shuttingDown = true
                            const active = yield* catalog.active()
                            if (active) yield* manager.stop(active.captureId)
                            if (mode === 'desktop') yield* exports.cancelAll()
                            else yield* exports.interruptAll()
                            completed = true
                        }).pipe(
                            Effect.mapError(
                                (cause) =>
                                    new ShutdownError({
                                        message:
                                            'Application shutdown could not be finalized safely.',
                                        cause,
                                    }),
                            ),
                        ),
                    )
                    .pipe(
                        Effect.timeoutFail({
                            duration: '30 seconds',
                            onTimeout: () =>
                                new ShutdownError({
                                    message: 'Application shutdown exceeded the 30 second limit.',
                                }),
                        }),
                    )

            return ShutdownCoordinator.of({
                assertAcceptingMutations: () =>
                    shuttingDown
                        ? Effect.fail(
                              new CaptureStorageUnavailable({
                                  title: 'The application is shutting down',
                                  retryable: true,
                              }),
                          )
                        : Effect.void,
                status,
                shutdownDesktop: () => run('desktop'),
                shutdownServer: () => run('server'),
                closeRealtime: () => realtime.close,
            })
        }),
    )
}

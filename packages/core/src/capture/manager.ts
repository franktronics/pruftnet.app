import { randomBytes } from 'node:crypto'

import {
    CaptureEventBatch,
    CaptureAlreadyRunning,
    CaptureNotFound,
    CaptureSession,
    CaptureStorageUnavailable,
    LiveCaptureSource,
    PacketSummaryBatch,
    type CaptureInterface,
    type CaptureInterfaceCapabilities,
    type CaptureRpcError,
    type CaptureSource,
    type CaptureStatSampleList,
    type CaptureStats,
    type RegistrySnapshot,
} from '@repo/shared/capture'
import { Context, Duration, Effect, Fiber, Layer, Schedule, Schema } from 'effect'

import { AppDataPaths } from '#core/storage'

import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
} from './capture-session-repository'
import { Capture } from './service'
import { CaptureRecovery } from './recovery'

type ManagerError = Schema.Schema.Type<typeof CaptureRpcError>

function managerError(error: CaptureRepositoryError | StoredCaptureNotFound): ManagerError {
    if (error._tag === 'StoredCaptureNotFound') {
        return new CaptureNotFound({ title: 'Capture not found' })
    }
    return new CaptureStorageUnavailable({
        title: 'Capture storage is unavailable',
        message: error.message,
        retryable: true,
    })
}

function asSession(record: {
    readonly captureId: string
    readonly state: string
    readonly source: CaptureSource
    readonly registryRevision: string
    readonly startedAtNs: string
    readonly stoppedAtNs: string | null
    readonly failure: { readonly message: string } | null
}) {
    const state: CaptureSession['state'] =
        record.state === 'preparing'
            ? 'starting'
            : record.state === 'capturing'
              ? 'running'
              : record.state === 'stopping'
                ? 'stopping'
                : record.state === 'failed'
                  ? 'failed'
                  : 'stopped'
    return new CaptureSession({
        captureId: record.captureId,
        state,
        source: record.source,
        registryRevision: record.registryRevision,
        startedAtNs: record.startedAtNs,
        stoppedAtNs: record.stoppedAtNs,
        failure: record.failure?.message ?? null,
    })
}

export interface CaptureSessionManagerService {
    readonly listInterfaces: () => Effect.Effect<ReadonlyArray<CaptureInterface>, ManagerError>
    readonly capabilities: (
        name: string,
        monitorMode: boolean,
    ) => Effect.Effect<CaptureInterfaceCapabilities, ManagerError>
    readonly start: (source: CaptureSource) => Effect.Effect<CaptureSession, ManagerError>
    readonly stop: (captureId: string) => Effect.Effect<CaptureSession, ManagerError>
    readonly session: (captureId: string) => Effect.Effect<CaptureSession, ManagerError>
    readonly summaries: (
        captureId: string,
        cursor: string | undefined,
        limit: number,
    ) => Effect.Effect<PacketSummaryBatch, ManagerError>
    readonly registry: (revision: string) => Effect.Effect<RegistrySnapshot, ManagerError>
    readonly detail: (
        captureId: string,
        packetId: string,
        registryRevision?: string,
        analysisRevision?: string,
    ) => Effect.Effect<Uint8Array, ManagerError>
    readonly stats: (captureId: string) => Effect.Effect<CaptureStats, ManagerError>
    readonly statSamples: (
        captureId: string,
        limit: number,
    ) => Effect.Effect<CaptureStatSampleList, ManagerError>
    readonly events: (
        captureId: string,
        cursor: string | undefined,
        limit: number,
    ) => Effect.Effect<CaptureEventBatch, ManagerError>
}

export class CaptureSessionManager extends Context.Tag('@repo/core/capture/CaptureSessionManager')<
    CaptureSessionManager,
    CaptureSessionManagerService
>() {
    static readonly layer = Layer.scoped(
        CaptureSessionManager,
        Effect.gen(function* () {
            const capture = yield* Capture
            const repository = yield* CaptureSessionRepository
            const paths = yield* AppDataPaths
            const recovery = yield* CaptureRecovery
            const applicationScope = yield* Effect.scope
            const lifecycle = yield* Effect.makeSemaphore(1)
            const supervisors = new Map<string, Fiber.RuntimeFiber<void, never>>()
            const summaryCursors = new Map<string, string>()
            const eventCursors = new Map<string, string>()

            yield* repository.reconcileInterrupted().pipe(Effect.mapError(managerError))
            yield* recovery.recoverInterrupted()

            const persistSegments = Effect.fn('CaptureSessionManager.persistSegments')(function* (
                captureId: string,
            ) {
                const segments = yield* capture.segments(captureId)
                yield* repository
                    .upsertSegments(captureId, segments)
                    .pipe(Effect.mapError(managerError))
            })

            const persistAvailableSummaries = Effect.fn(
                'CaptureSessionManager.persistAvailableSummaries',
            )(function* (captureId: string) {
                while (true) {
                    const summaries = yield* capture.summaries(
                        captureId,
                        summaryCursors.get(captureId),
                        1024,
                    )
                    if (summaries.gapBeforeFirst) {
                        yield* Effect.logError(
                            `Capture ${captureId} summary journal overran before persistence.`,
                        )
                    }
                    yield* repository
                        .persistSummaries(captureId, summaries.summaries)
                        .pipe(Effect.mapError(managerError))
                    if (!summaries.lastCursor) return
                    summaryCursors.set(captureId, summaries.lastCursor)
                    if (
                        summaries.lastCursor === summaries.newestAvailableCursor ||
                        summaries.summaries.length < 1024
                    )
                        return
                }
            })

            const synchronize = Effect.fn('CaptureSessionManager.synchronize')(function* (
                captureId: string,
            ) {
                const stats = yield* capture.stats(captureId)
                yield* repository.persistStats(captureId, stats).pipe(Effect.mapError(managerError))
                yield* persistSegments(captureId)
                yield* persistAvailableSummaries(captureId)
                const events = yield* capture.events(captureId, eventCursors.get(captureId), 512)
                yield* repository
                    .persistEvents(captureId, events.events)
                    .pipe(Effect.mapError(managerError))
                const lastEvent = events.events.at(-1)
                if (lastEvent) eventCursors.set(captureId, lastEvent.cursor)
                return yield* capture.session(captureId)
            })

            const supervise = (captureId: string) =>
                synchronize(captureId).pipe(
                    Effect.tap((session) =>
                        session.state === 'running' || session.state === 'starting'
                            ? Effect.void
                            : Effect.gen(function* () {
                                  const current = yield* stored(repository.get(captureId))
                                  if (session.state === 'failed') {
                                      yield* stored(
                                          repository.transition(captureId, 'failed', {
                                              stoppedAtNs: session.stoppedAtNs ?? undefined,
                                              failureCode: 'CaptureFailed',
                                              failureMessage:
                                                  session.failure ?? 'The capture worker failed.',
                                          }),
                                      )
                                  } else {
                                      if (current.state === 'capturing') {
                                          yield* stored(
                                              repository.transition(captureId, 'stopping'),
                                          )
                                      }
                                      yield* stored(
                                          repository.transition(captureId, 'stopped', {
                                              stoppedAtNs: session.stoppedAtNs ?? undefined,
                                          }),
                                      )
                                  }
                                  return yield* Effect.fail('terminal' as const)
                              }),
                    ),
                    Effect.catchAll((error) => {
                        if (error === 'terminal') return Effect.fail(error)
                        if (
                            error._tag === 'CaptureWorkerCrashed' ||
                            error._tag === 'CaptureWorkerUnavailable'
                        ) {
                            return repository
                                .transition(captureId, 'failed', {
                                    failureCode: error._tag,
                                    failureMessage: error.message ?? error.title,
                                })
                                .pipe(
                                    Effect.ignore,
                                    Effect.zipRight(Effect.fail('terminal' as const)),
                                )
                        }
                        return Effect.logWarning(
                            `Capture ${captureId} synchronization failed: ${error.title}`,
                        )
                    }),
                    Effect.repeat(Schedule.spaced(Duration.seconds(1))),
                    Effect.ignore,
                    Effect.ensuring(
                        Effect.sync(() => {
                            supervisors.delete(captureId)
                        }),
                    ),
                )

            const startSupervisor = Effect.fn('CaptureSessionManager.startSupervisor')(function* (
                captureId: string,
            ) {
                if (supervisors.has(captureId)) return
                const fiber = yield* Effect.forkIn(supervise(captureId), applicationScope)
                supervisors.set(captureId, fiber)
            })

            const stored = <A>(
                effect: Effect.Effect<A, CaptureRepositoryError | StoredCaptureNotFound>,
            ) => effect.pipe(Effect.mapError(managerError))

            return CaptureSessionManager.of({
                listInterfaces: capture.listInterfaces,
                capabilities: capture.capabilities,
                start: (requestedSource) =>
                    lifecycle.withPermits(1)(
                        Effect.uninterruptible(
                            Effect.gen(function* () {
                                const existing = yield* repository
                                    .active()
                                    .pipe(Effect.mapError(managerError))
                                if (existing) {
                                    return yield* new CaptureAlreadyRunning({
                                        title: 'A capture is already running',
                                        activeCaptureId: existing.captureId,
                                    })
                                }
                                const source =
                                    requestedSource._tag === 'Live'
                                        ? new LiveCaptureSource({
                                              ...requestedSource,
                                              spoolTemporary: false,
                                          })
                                        : requestedSource
                                const captureId = randomBytes(16).toString('hex')
                                yield* stored(repository.create(captureId, source))
                                const prepared = {
                                    captureId,
                                    spoolDirectory: paths.captureSegmentsRoot(captureId),
                                }
                                const started = yield* (
                                    source._tag === 'Live'
                                        ? capture.startLive(source, prepared)
                                        : capture.startReplay(source.fileId, prepared)
                                ).pipe(
                                    Effect.tapError((error) =>
                                        repository
                                            .transition(captureId, 'failed', {
                                                failureCode: error._tag,
                                                failureMessage: error.title,
                                            })
                                            .pipe(Effect.ignore),
                                    ),
                                )
                                if (started.captureId !== captureId) {
                                    yield* capture.stop(started.captureId).pipe(Effect.ignore)
                                    yield* repository
                                        .transition(captureId, 'failed', {
                                            failureCode: 'CaptureIdentityMismatch',
                                            failureMessage:
                                                'The capture worker did not use the durable capture identity.',
                                        })
                                        .pipe(Effect.ignore)
                                    return yield* new CaptureStorageUnavailable({
                                        title: 'Capture identity mismatch',
                                        message:
                                            'The capture worker did not use the durable capture identity.',
                                    })
                                }
                                const record = yield* stored(
                                    repository.transition(captureId, 'capturing', {
                                        registryRevision: started.registryRevision,
                                    }),
                                )
                                yield* startSupervisor(captureId)
                                return asSession(record)
                            }),
                        ),
                    ),
                stop: (captureId) =>
                    lifecycle.withPermits(1)(
                        Effect.uninterruptible(
                            Effect.gen(function* () {
                                yield* stored(repository.transition(captureId, 'stopping'))
                                const stopped = yield* capture.stop(captureId)
                                yield* synchronize(captureId).pipe(Effect.ignore)
                                const record = yield* stored(
                                    repository.transition(
                                        captureId,
                                        stopped.state === 'failed' ? 'failed' : 'stopped',
                                        {
                                            stoppedAtNs: stopped.stoppedAtNs ?? undefined,
                                            failureCode: stopped.failure
                                                ? 'CaptureFailed'
                                                : undefined,
                                            failureMessage: stopped.failure ?? undefined,
                                        },
                                    ),
                                )
                                return asSession(record)
                            }),
                        ),
                    ),
                session: Effect.fn('CaptureSessionManager.session')(function* (captureId) {
                    const record = yield* stored(repository.get(captureId))
                    if (activeCaptureStates.includes(record.state)) {
                        const current = yield* capture.session(captureId)
                        return new CaptureSession({ ...current, source: record.source })
                    }
                    return asSession(record)
                }),
                summaries: Effect.fn('CaptureSessionManager.summaries')(
                    function* (captureId, cursor, limit) {
                        const record = yield* stored(repository.get(captureId))
                        if (activeCaptureStates.includes(record.state)) {
                            const batch = yield* capture.summaries(captureId, cursor, limit)
                            yield* repository
                                .persistSummaries(captureId, batch.summaries)
                                .pipe(Effect.mapError(managerError))
                            return batch
                        }
                        const summaries = yield* repository
                            .readSummaries(captureId, cursor, limit)
                            .pipe(Effect.mapError(managerError))
                        return new PacketSummaryBatch({
                            captureId,
                            firstCursor: summaries.at(0)?.cursor ?? null,
                            lastCursor: summaries.at(-1)?.cursor ?? null,
                            oldestAvailableCursor: summaries.at(0)?.cursor ?? null,
                            newestAvailableCursor: summaries.at(-1)?.cursor ?? null,
                            gapBeforeFirst: false,
                            captureComplete: true,
                            summaries,
                        })
                    },
                ),
                registry: capture.registry,
                detail: Effect.fn('CaptureSessionManager.detail')(
                    function* (captureId, packetId, registryRevision, analysisRevision) {
                        const record = yield* stored(repository.get(captureId))
                        const revision = registryRevision ?? record.registryRevision
                        if (activeCaptureStates.includes(record.state)) {
                            return yield* capture.detail(
                                captureId,
                                packetId,
                                revision,
                                analysisRevision ?? revision,
                            )
                        }
                        return yield* capture.storedDetail(
                            captureId,
                            paths.captureSegmentsRoot(captureId),
                            packetId,
                            revision,
                            analysisRevision ?? revision,
                        )
                    },
                ),
                stats: Effect.fn('CaptureSessionManager.stats')(function* (captureId) {
                    const record = yield* stored(repository.get(captureId))
                    if (activeCaptureStates.includes(record.state)) {
                        const stats = yield* capture.stats(captureId)
                        yield* repository
                            .persistStats(captureId, stats)
                            .pipe(Effect.mapError(managerError))
                        return stats
                    }
                    const stats = yield* repository
                        .latestStats(captureId)
                        .pipe(Effect.mapError(managerError))
                    if (stats) return stats
                    return yield* new CaptureStorageUnavailable({
                        title: 'Capture statistics are unavailable',
                    })
                }),
                statSamples: (captureId, limit) =>
                    repository
                        .readStatSamples(captureId, limit)
                        .pipe(Effect.mapError(managerError)),
                events: Effect.fn('CaptureSessionManager.events')(
                    function* (captureId, cursor, limit) {
                        const record = yield* stored(repository.get(captureId))
                        if (activeCaptureStates.includes(record.state)) {
                            const batch = yield* capture.events(captureId, cursor, limit)
                            yield* repository
                                .persistEvents(captureId, batch.events)
                                .pipe(Effect.mapError(managerError))
                            return batch
                        }
                        const events = yield* repository
                            .readEvents(captureId, cursor, limit)
                            .pipe(Effect.mapError(managerError))
                        return new CaptureEventBatch({ captureId, gapBeforeFirst: false, events })
                    },
                ),
            })
        }),
    )
}

const activeCaptureStates: ReadonlyArray<string> = ['preparing', 'capturing', 'stopping']

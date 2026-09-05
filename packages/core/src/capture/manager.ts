import { randomBytes } from 'node:crypto'

import {
    CaptureEventBatch,
    CaptureAlreadyRunning,
    CaptureNotFound,
    CaptureSession,
    CaptureStorageUnavailable,
    LiveCaptureSource,
    PacketSummaryBatch,
    PacketSummaryRange,
    type PacketSummaryFilter,
    PacketSummaryManifest,
    type CaptureInterface,
    type CaptureInterfaceCapabilities,
    type CaptureRpcError,
    type CaptureSource,
    type CaptureStatSample,
    type CaptureStatSampleList,
    type CaptureStats,
    type RegistrySnapshot,
} from '@repo/shared/capture'
import {
    Clock,
    Context,
    Duration,
    Effect,
    Fiber,
    Layer,
    Schedule,
    Schema,
    Stream,
    Option,
} from 'effect'

import { AppDataPaths } from '#core/storage'
import { RealtimeHub } from '#core/realtime/hub'

import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
} from './capture-session-repository'
import { Capture } from './service'
import { CaptureRecovery } from './recovery'
import { SummaryDeliveryCache } from './summary-delivery-cache'

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

function hasCursorGap(afterCursor: string | undefined, firstCursor: string | undefined) {
    if (!firstCursor) return false
    return BigInt(firstCursor) > (afterCursor ? BigInt(afterCursor) + 1n : 1n)
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
    readonly streamSummaries: (
        captureId: string,
        cursor?: string,
    ) => Stream.Stream<PacketSummaryBatch, ManagerError>
    readonly summaryManifest: (
        captureId: string,
        filter: PacketSummaryFilter | null,
    ) => Effect.Effect<PacketSummaryManifest, ManagerError>
    readonly summaryRange: (
        captureId: string,
        revision: string,
        filter: PacketSummaryFilter | null,
        startIndex: number,
        limit: number,
    ) => Effect.Effect<PacketSummaryRange, ManagerError>
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
            const realtime = yield* RealtimeHub
            const applicationScope = yield* Effect.scope
            const lifecycle = yield* Effect.makeSemaphore(1)
            const supervisors = new Map<string, Fiber.RuntimeFiber<void, never>>()
            const summaryDelivery = new SummaryDeliveryCache()
            const summaryCursors = new Map<string, string>()
            const eventCursors = new Map<string, string>()
            const lastMetadataSyncMs = new Map<string, number>()

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
            )(function* (captureId: string, drainAll = false) {
                const started = yield* Clock.currentTimeMillis
                const previousCursor = summaryCursors.get(captureId)
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
                    if (!summaries.lastCursor)
                        return {
                            cursor: summaryCursors.get(captureId) ?? null,
                            changed: summaryCursors.get(captureId) !== previousCursor,
                        }
                    summaryDelivery.append(captureId, summaries.summaries)
                    summaryCursors.set(captureId, summaries.lastCursor)
                    yield* realtime.publishCaptureDataAvailable({
                        captureId,
                        summaryCursor: summaries.lastCursor,
                        eventCursor: eventCursors.get(captureId) ?? null,
                    })
                    if (
                        (!drainAll && (yield* Clock.currentTimeMillis) - started >= 8) ||
                        summaries.lastCursor === summaries.newestAvailableCursor ||
                        summaries.summaries.length < 1024
                    )
                        return {
                            cursor: summaries.lastCursor,
                            changed: summaries.lastCursor !== previousCursor,
                        }
                }
            })

            const persistAvailableEvents = Effect.fn(
                'CaptureSessionManager.persistAvailableEvents',
            )(function* (captureId: string, drainAll = false) {
                const started = yield* Clock.currentTimeMillis
                const previousCursor = eventCursors.get(captureId)
                while (true) {
                    const events = yield* capture.events(
                        captureId,
                        eventCursors.get(captureId),
                        512,
                    )
                    if (events.gapBeforeFirst) {
                        yield* Effect.logError(
                            `Capture ${captureId} event journal overran before persistence.`,
                        )
                    }
                    yield* repository
                        .persistEvents(captureId, events.events)
                        .pipe(Effect.mapError(managerError))
                    const lastEvent = events.events.at(-1)
                    if (!lastEvent)
                        return {
                            cursor: eventCursors.get(captureId) ?? null,
                            changed: eventCursors.get(captureId) !== previousCursor,
                        }
                    eventCursors.set(captureId, lastEvent.cursor)
                    if (
                        events.events.length < 512 ||
                        (!drainAll && (yield* Clock.currentTimeMillis) - started >= 8)
                    )
                        return {
                            cursor: lastEvent.cursor,
                            changed: lastEvent.cursor !== previousCursor,
                        }
                }
            })

            const synchronize = Effect.fn('CaptureSessionManager.synchronize')(function* (
                captureId: string,
                forceMetadata = false,
            ) {
                const now = yield* Clock.currentTimeMillis
                const refreshMetadata =
                    forceMetadata || now - (lastMetadataSyncMs.get(captureId) ?? 0) >= 1_000
                let stats: CaptureStats | null = null
                let statSample: CaptureStatSample | null = null
                if (refreshMetadata) {
                    stats = yield* capture.stats(captureId)
                    statSample = yield* repository
                        .persistStats(captureId, stats)
                        .pipe(Effect.mapError(managerError))
                    yield* persistSegments(captureId)
                    lastMetadataSyncMs.set(captureId, now)
                }
                const summaries = yield* persistAvailableSummaries(captureId, forceMetadata)
                const events = yield* persistAvailableEvents(captureId, forceMetadata)
                const session = yield* capture.session(captureId)
                if (summaries.changed || events.changed) {
                    yield* realtime.publishCaptureDataAvailable({
                        captureId,
                        summaryCursor: summaries.cursor,
                        eventCursor: events.cursor,
                    })
                }
                if (
                    refreshMetadata &&
                    (session.state === 'running' || session.state === 'starting')
                ) {
                    const record = yield* stored(repository.get(captureId))
                    yield* realtime.publishCaptureRecord(record)
                    yield* realtime.publishCaptureSnapshot({
                        captureId,
                        session: new CaptureSession({ ...session, source: record.source }),
                        stats,
                        statSample,
                        summaryCursor: summaries.cursor,
                        eventCursor: events.cursor,
                        terminal: false,
                    })
                }
                return { session, stats, statSample, summaries, events }
            })

            const supervise = (captureId: string) =>
                synchronize(captureId).pipe(
                    Effect.tap((synchronized) =>
                        synchronized.session.state === 'running' ||
                        synchronized.session.state === 'starting'
                            ? Effect.void
                            : lifecycle.withPermits(1)(
                                  Effect.gen(function* () {
                                      const final = yield* synchronize(captureId, true)
                                      const { session, stats, statSample, summaries, events } =
                                          final
                                      const current = yield* stored(repository.get(captureId))
                                      if (session.state === 'failed') {
                                          const record = yield* stored(
                                              repository.transition(captureId, 'failed', {
                                                  stoppedAtNs: session.stoppedAtNs ?? undefined,
                                                  failureCode: 'CaptureFailed',
                                                  failureMessage:
                                                      session.failure ??
                                                      'The capture worker failed.',
                                              }),
                                          )
                                          yield* realtime.publishCaptureRecord(record)
                                          yield* realtime.publishCaptureSnapshot({
                                              captureId,
                                              session: asSession(record),
                                              stats,
                                              statSample,
                                              summaryCursor: summaries.cursor,
                                              eventCursor: events.cursor,
                                              terminal: true,
                                          })
                                      } else {
                                          if (current.state === 'capturing') {
                                              const stopping = yield* stored(
                                                  repository.transition(captureId, 'stopping'),
                                              )
                                              yield* realtime.publishCaptureRecord(stopping)
                                          }
                                          const record = yield* stored(
                                              repository.transition(captureId, 'stopped', {
                                                  stoppedAtNs: session.stoppedAtNs ?? undefined,
                                              }),
                                          )
                                          yield* realtime.publishCaptureRecord(record)
                                          yield* realtime.publishCaptureSnapshot({
                                              captureId,
                                              session: asSession(record),
                                              stats,
                                              statSample,
                                              summaryCursor: summaries.cursor,
                                              eventCursor: events.cursor,
                                              terminal: true,
                                          })
                                      }
                                      return yield* Effect.fail('terminal' as const)
                                  }),
                              ),
                    ),
                    Effect.catchAll((error) => {
                        if (error === 'terminal') return Effect.fail(error)
                        if (
                            error._tag === 'CaptureWorkerCrashed' ||
                            error._tag === 'CaptureWorkerUnavailable'
                        ) {
                            return lifecycle.withPermits(1)(
                                repository
                                    .transition(captureId, 'failed', {
                                        failureCode: error._tag,
                                        failureMessage: error.message ?? error.title,
                                    })
                                    .pipe(
                                        Effect.tap((record) =>
                                            realtime.publishCaptureRecord(record).pipe(
                                                Effect.zipRight(
                                                    realtime.publishCaptureSnapshot({
                                                        captureId,
                                                        session: asSession(record),
                                                        stats: null,
                                                        statSample: null,
                                                        summaryCursor:
                                                            summaryCursors.get(captureId) ?? null,
                                                        eventCursor:
                                                            eventCursors.get(captureId) ?? null,
                                                        terminal: true,
                                                    }),
                                                ),
                                            ),
                                        ),
                                        Effect.ignore,
                                        Effect.zipRight(Effect.fail('terminal' as const)),
                                    ),
                            )
                        }
                        return Effect.logWarning(
                            `Capture ${captureId} synchronization failed: ${error.title}`,
                        )
                    }),
                    Effect.repeat(Schedule.spaced(Duration.millis(8))),
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
                const fiber = yield* Effect.forkIn(
                    Effect.interruptible(supervise(captureId)),
                    applicationScope,
                )
                supervisors.set(captureId, fiber)
            })

            const stored = <A>(
                effect: Effect.Effect<A, CaptureRepositoryError | StoredCaptureNotFound>,
            ) => effect.pipe(Effect.mapError(managerError))

            const readSummaries = Effect.fn('CaptureSessionManager.summaries')(function* (
                captureId: string,
                cursor: string | undefined,
                limit: number,
            ) {
                const record = yield* stored(repository.get(captureId))
                const summaries =
                    summaryDelivery.read(captureId, cursor, limit + 1) ??
                    (yield* repository
                        .readSummaries(captureId, cursor, limit + 1)
                        .pipe(Effect.mapError(managerError)))
                const hasMore = summaries.length > limit
                const page = hasMore ? summaries.slice(0, limit) : summaries
                return new PacketSummaryBatch({
                    captureId,
                    firstCursor: page.at(0)?.cursor ?? null,
                    lastCursor: page.at(-1)?.cursor ?? null,
                    oldestAvailableCursor: page.at(0)?.cursor ?? null,
                    newestAvailableCursor: page.at(-1)?.cursor ?? null,
                    gapBeforeFirst: hasCursorGap(cursor, page.at(0)?.cursor),
                    captureComplete: !activeCaptureStates.includes(record.state) && !hasMore,
                    summaries: page,
                })
            })

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
                                const preparing = yield* stored(
                                    repository.create(captureId, source),
                                )
                                yield* realtime.publishCaptureRecord(preparing)
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
                                            .pipe(
                                                Effect.tap(realtime.publishCaptureRecord),
                                                Effect.ignore,
                                            ),
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
                                        .pipe(
                                            Effect.tap(realtime.publishCaptureRecord),
                                            Effect.ignore,
                                        )
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
                                yield* realtime.publishCaptureRecord(record)
                                yield* startSupervisor(captureId)
                                return asSession(record)
                            }),
                        ),
                    ),
                stop: (captureId) =>
                    lifecycle.withPermits(1)(
                        Effect.uninterruptible(
                            Effect.gen(function* () {
                                const supervisor = supervisors.get(captureId)
                                if (supervisor) yield* Fiber.interrupt(supervisor)
                                const current = yield* stored(repository.get(captureId))
                                if (!activeCaptureStates.includes(current.state)) {
                                    return asSession(current)
                                }
                                if (current.state !== 'stopping') {
                                    const stopping = yield* stored(
                                        repository.transition(captureId, 'stopping'),
                                    )
                                    yield* realtime.publishCaptureRecord(stopping)
                                }
                                const stopped = yield* capture.stop(captureId)
                                const synchronized = yield* synchronize(captureId, true)
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
                                yield* realtime.publishCaptureRecord(record)
                                yield* realtime.publishCaptureSnapshot({
                                    captureId,
                                    session: asSession(record),
                                    stats: synchronized.stats,
                                    statSample: synchronized.statSample,
                                    summaryCursor: synchronized.summaries.cursor,
                                    eventCursor: synchronized.events.cursor,
                                    terminal: true,
                                })
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
                summaries: readSummaries,
                streamSummaries: (captureId, afterCursor) =>
                    Stream.unwrap(
                        Effect.sync(() => {
                            let cursor = afterCursor
                            let originTimestampNs: string | undefined
                            // Each HTTP response contains at most eight pages. Completing and reopening
                            // after consumption supplies bounded application-level flow control on HTTP.
                            return realtime.captureChanges(captureId).pipe(
                                Stream.filter(
                                    (change) =>
                                        change._tag === 'CaptureStreamReady' ||
                                        change._tag === 'CaptureHeartbeat' ||
                                        (change._tag === 'CaptureLiveSnapshot' &&
                                            change.terminal) ||
                                        (change._tag === 'CaptureDataAvailable' &&
                                            change.summaryCursor !== cursor),
                                ),
                                Stream.flatMap(() =>
                                    Stream.unwrap(
                                        Effect.gen(function* () {
                                            const manifest = yield* repository
                                                .summaryManifest(captureId, null)
                                                .pipe(Effect.mapError(managerError))
                                            originTimestampNs =
                                                manifest.originTimestampNs ?? undefined
                                            if (cursor === undefined) {
                                                const start = Math.max(
                                                    0,
                                                    manifest.totalRowCount - 1024,
                                                )
                                                const rows = yield* repository
                                                    .readSummaryRange(
                                                        captureId,
                                                        manifest.revision,
                                                        null,
                                                        start,
                                                        Math.min(
                                                            1024,
                                                            manifest.totalRowCount - start,
                                                        ),
                                                    )
                                                    .pipe(Effect.mapError(managerError))
                                                cursor = rows.at(-1)?.cursor ?? '0'
                                                return Stream.succeed(
                                                    new PacketSummaryBatch({
                                                        captureId,
                                                        originTimestampNs,
                                                        firstCursor: rows.at(0)?.cursor ?? null,
                                                        lastCursor: rows.at(-1)?.cursor ?? null,
                                                        oldestAvailableCursor:
                                                            rows.at(0)?.cursor ?? null,
                                                        newestAvailableCursor: manifest.revision,
                                                        gapBeforeFirst:
                                                            start > 0 || manifest.hasGaps,
                                                        captureComplete: manifest.captureComplete,
                                                        summaries: rows,
                                                    }),
                                                )
                                            }
                                            const watermark = BigInt(manifest.revision)
                                            return Stream.paginateEffect(cursor, (previous) =>
                                                Effect.gen(function* () {
                                                    const batch = yield* readSummaries(
                                                        captureId,
                                                        previous,
                                                        1024,
                                                    )
                                                    const rows = batch.summaries.filter(
                                                        (row) => BigInt(row.cursor) <= watermark,
                                                    )
                                                    cursor = rows.at(-1)?.cursor ?? previous
                                                    const more =
                                                        rows.length > 0 &&
                                                        BigInt(cursor) < watermark
                                                    return [
                                                        new PacketSummaryBatch({
                                                            ...batch,
                                                            summaries: rows,
                                                            firstCursor: rows.at(0)?.cursor ?? null,
                                                            lastCursor: rows.at(-1)?.cursor ?? null,
                                                            newestAvailableCursor:
                                                                manifest.revision,
                                                            captureComplete:
                                                                manifest.captureComplete && !more,
                                                            originTimestampNs,
                                                        }),
                                                        more ? Option.some(cursor) : Option.none(),
                                                    ] as const
                                                }),
                                            )
                                        }),
                                    ),
                                ),
                                Stream.take(8),
                            )
                        }),
                    ),
                summaryManifest: Effect.fn('CaptureSessionManager.summaryManifest')(
                    function* (captureId, filter) {
                        const manifest = yield* repository
                            .summaryManifest(captureId, filter)
                            .pipe(Effect.mapError(managerError))
                        if (manifest.initialSummaries) return manifest
                        const initialSummaries = yield* repository
                            .readSummaryRange(captureId, manifest.revision, filter, 0, 256)
                            .pipe(Effect.mapError(managerError))
                        return new PacketSummaryManifest({ ...manifest, initialSummaries })
                    },
                ),
                summaryRange: Effect.fn('CaptureSessionManager.summaryRange')(
                    function* (captureId, revision, filter, startIndex, limit) {
                        const summaries = yield* repository
                            .readSummaryRange(captureId, revision, filter, startIndex, limit)
                            .pipe(Effect.mapError(managerError))
                        return new PacketSummaryRange({
                            captureId,
                            revision,
                            startIndex,
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
                    const stats = yield* repository
                        .latestStats(captureId)
                        .pipe(Effect.mapError(managerError))
                    if (stats) return stats
                    if (activeCaptureStates.includes(record.state)) {
                        const liveStats = yield* capture.stats(captureId)
                        yield* repository
                            .persistStats(captureId, liveStats)
                            .pipe(Effect.mapError(managerError))
                        return liveStats
                    }
                    return yield* new CaptureStorageUnavailable({
                        title: 'Capture statistics are unavailable',
                    })
                }),
                statSamples: (captureId, limit) =>
                    repository
                        .readStatSamples(captureId, limit)
                        .pipe(Effect.mapError(managerError)),
                events: Effect.fn('CaptureSessionManager.events')(function* (
                    captureId: string,
                    cursor: string | undefined,
                    limit: number,
                ) {
                    yield* stored(repository.get(captureId))
                    const events = yield* repository
                        .readEvents(captureId, cursor, limit)
                        .pipe(Effect.mapError(managerError))
                    return new CaptureEventBatch({
                        captureId,
                        gapBeforeFirst: hasCursorGap(cursor, events.at(0)?.cursor),
                        events,
                    })
                }),
            })
        }),
    )
}

const activeCaptureStates: ReadonlyArray<string> = ['preparing', 'capturing', 'stopping']

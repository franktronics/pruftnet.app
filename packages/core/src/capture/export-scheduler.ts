import { createHash, randomBytes } from 'node:crypto'
import { rename, rm, stat } from 'node:fs/promises'

import {
    CaptureNotFound,
    CaptureStorageUnavailable,
    ExportJob,
    ExportJobFailure,
    ExportJobList,
    ExportOptionsInvalid,
    ExportUnavailable,
    type CaptureRpcError,
    type CreateExportRequest,
} from '@repo/shared/capture'
import { Cause, Clock, Context, Deferred, Effect, Fiber, Layer, Option, Schema } from 'effect'

import { CaptureCatalog } from './catalog'
import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
    type ExportSnapshot,
} from './capture-session-repository'
import {
    ExportDestination,
    type ExportDestinationError,
    type ResolvedExportDestination,
} from './export-destination'
import { ExportEncoder, type ExportEncodingError } from './export-encoder'
import {
    ExportArtifactRepository,
    ExportRepositoryError,
    type CachedExportArtifact,
} from './export-repository'
import { CaptureSessionManager } from './manager'
import { Capture } from './service'

type SchedulerError = Schema.Schema.Type<typeof CaptureRpcError>
type ExportJobFields = ConstructorParameters<typeof ExportJob>[0]

interface ArtifactProgress {
    readonly captureId: string
    readonly format: CreateExportRequest['format']
    readonly phase: ExportJob['phase']
    readonly packetsTotal: string
    readonly packetsWritten: string
    readonly bytesWritten: string
}

const MAX_RECENT_EXPORTS = 8

function repositoryFailure(
    error: ExportRepositoryError | CaptureRepositoryError | StoredCaptureNotFound,
): SchedulerError {
    return error._tag === 'StoredCaptureNotFound'
        ? new CaptureNotFound({ title: 'Capture not found' })
        : new CaptureStorageUnavailable({
              title: 'Export storage is unavailable',
              message: error.message,
              retryable: true,
          })
}

function destinationFailure(error: ExportDestinationError): SchedulerError {
    return new ExportOptionsInvalid({
        title: 'Export destination is unavailable',
        message: error.message,
        retryable: error.code === 'Unavailable',
    })
}

function encodingFailure(error: ExportEncodingError): SchedulerError {
    return new ExportUnavailable({
        title: 'Export failed',
        message: error.message,
        retryable: error.code !== 'FormatUnsupported' && error.code !== 'SourceCorrupt',
    })
}

function fingerprint(snapshot: ExportSnapshot) {
    return createHash('sha256')
        .update(
            JSON.stringify(
                snapshot.segments.map((segment) => [
                    String(segment.generation),
                    segment.committedBytes,
                    segment.committedPackets,
                ]),
            ),
        )
        .digest('hex')
}

function artifactKey(request: Pick<CreateExportRequest, 'captureId' | 'format'>) {
    return `${request.captureId}:${request.format}`
}

function compareJobs(left: ExportJob, right: ExportJob) {
    if (left.state === 'running' && right.state !== 'running') return -1
    if (left.state !== 'running' && right.state === 'running') return 1
    const leftStarted = BigInt(left.startedAtNs)
    const rightStarted = BigInt(right.startedAtNs)
    return leftStarted === rightStarted ? 0 : leftStarted > rightStarted ? -1 : 1
}

export interface ExportSchedulerStatus {
    readonly activeExportIds: ReadonlyArray<string>
}

export interface ExportSchedulerService {
    readonly create: (request: CreateExportRequest) => Effect.Effect<ExportJob, SchedulerError>
    readonly list: () => Effect.Effect<ExportJobList>
    readonly cancelAll: () => Effect.Effect<void>
    readonly interruptAll: () => Effect.Effect<void>
    readonly status: () => Effect.Effect<ExportSchedulerStatus>
}

export class ExportScheduler extends Context.Tag('@repo/core/capture/ExportScheduler')<
    ExportScheduler,
    ExportSchedulerService
>() {
    static readonly layer = Layer.scoped(
        ExportScheduler,
        Effect.gen(function* () {
            const artifacts = yield* ExportArtifactRepository
            const captures = yield* CaptureSessionRepository
            const catalog = yield* CaptureCatalog
            const destination = yield* ExportDestination
            const encoder = yield* ExportEncoder
            const captureService = yield* Capture
            yield* CaptureSessionManager
            const applicationScope = yield* Effect.scope
            const registryLock = yield* Effect.makeSemaphore(1)
            const artifactFibers = new Map<
                string,
                Fiber.RuntimeFiber<CachedExportArtifact, SchedulerError>
            >()
            const jobFibers = new Map<string, Fiber.RuntimeFiber<void, never>>()
            const jobs = new Map<string, ExportJob>()
            const artifactProgress = new Map<string, ArtifactProgress>()
            const artifactSubscribers = new Map<string, Set<string>>()
            const terminalOrder: Array<string> = []

            const stored = <A>(
                effect: Effect.Effect<
                    A,
                    ExportRepositoryError | CaptureRepositoryError | StoredCaptureNotFound
                >,
            ) => effect.pipe(Effect.mapError(repositoryFailure))

            const updateJob = (exportId: string, patch: Partial<ExportJobFields>) => {
                const current = jobs.get(exportId)
                if (!current) return
                jobs.set(exportId, new ExportJob({ ...current, ...patch } as ExportJobFields))
            }

            const pruneTerminalJobs = () => {
                while (terminalOrder.length > MAX_RECENT_EXPORTS) {
                    const exportId = terminalOrder.shift()
                    if (exportId && jobs.get(exportId)?.state !== 'running') jobs.delete(exportId)
                }
            }

            const setArtifactProgress = (key: string, value: ArtifactProgress) => {
                artifactProgress.set(key, value)
                for (const exportId of artifactSubscribers.get(key) ?? []) {
                    if (jobs.get(exportId)?.state !== 'running') continue
                    updateJob(exportId, {
                        phase: value.phase,
                        packetsTotal: value.packetsTotal,
                        packetsWritten: value.packetsWritten,
                        bytesWritten: value.bytesWritten,
                    })
                }
            }

            const subscribeToArtifact = (key: string, exportId: string) => {
                const subscribers = artifactSubscribers.get(key) ?? new Set<string>()
                subscribers.add(exportId)
                artifactSubscribers.set(key, subscribers)
                const current = artifactProgress.get(key)
                if (current) {
                    updateJob(exportId, {
                        phase: current.phase,
                        packetsTotal: current.packetsTotal,
                        packetsWritten: current.packetsWritten,
                        bytesWritten: current.bytesWritten,
                    })
                }
            }

            const unsubscribeFromArtifact = (key: string, exportId: string) => {
                const subscribers = artifactSubscribers.get(key)
                if (!subscribers) return
                subscribers.delete(exportId)
                if (subscribers.size > 0) return
                artifactSubscribers.delete(key)
                if (!artifactFibers.has(key)) artifactProgress.delete(key)
            }

            const validateRequest = Effect.fn('ExportScheduler.validateRequest')(function* (
                request: CreateExportRequest,
            ) {
                const capture = yield* catalog.get(request.captureId)
                if (capture.state === 'deleted' || capture.state === 'deleting') {
                    return yield* new CaptureNotFound({ title: 'Capture not found' })
                }
                if (request.format === 'pcap' && capture.interfaceNames.length !== 1) {
                    return yield* new ExportOptionsInvalid({
                        title: 'Classic pcap export is unavailable',
                        message: 'Captures with multiple interfaces require pcapng.',
                    })
                }
                return capture
            })

            const ensureArtifact = Effect.fn('ExportScheduler.ensureArtifact')(function* (
                request: CreateExportRequest,
            ) {
                const key = artifactKey(request)
                setArtifactProgress(key, {
                    captureId: request.captureId,
                    format: request.format,
                    phase: 'preparing',
                    packetsTotal: '0',
                    packetsWritten: '0',
                    bytesWritten: '0',
                })
                const capture = yield* validateRequest(request)
                const nativeLease =
                    capture.state === 'capturing' || capture.state === 'stopping'
                        ? yield* captureService.leaseSegmentSnapshot(request.captureId)
                        : undefined

                const acquire = Effect.gen(function* () {
                    if (nativeLease) {
                        yield* stored(
                            captures.upsertSegments(request.captureId, nativeLease.segments),
                        )
                    }
                    return yield* stored(
                        captures.acquireExportSnapshot(
                            request.captureId,
                            nativeLease?.segments.map((segment) => segment.generation),
                        ),
                    )
                }).pipe(
                    Effect.onError(() =>
                        nativeLease
                            ? captureService
                                  .releaseSegmentSnapshot(request.captureId, nativeLease.leaseToken)
                                  .pipe(Effect.ignore)
                            : Effect.void,
                    ),
                )

                const snapshot = yield* acquire
                const packetsTotal = snapshot.segments
                    .reduce((total, segment) => total + BigInt(segment.committedPackets), 0n)
                    .toString()
                const release = captures
                    .releaseExportSnapshot(
                        request.captureId,
                        snapshot.segments.map((segment) => segment.generation),
                    )
                    .pipe(
                        Effect.ignore,
                        Effect.zipRight(
                            nativeLease
                                ? captureService
                                      .releaseSegmentSnapshot(
                                          request.captureId,
                                          nativeLease.leaseToken,
                                      )
                                      .pipe(Effect.ignore)
                                : Effect.void,
                        ),
                    )

                return yield* Effect.gen(function* () {
                    const sourceFingerprint = fingerprint(snapshot)
                    const cached = yield* stored(artifacts.get(request.captureId, request.format))
                    if (cached?.sourceFingerprint === sourceFingerprint) {
                        const valid = yield* Effect.promise(() =>
                            stat(cached.artifactPath)
                                .then((file) => BigInt(file.size) === BigInt(cached.finalSize))
                                .catch(() => false),
                        )
                        if (valid) {
                            setArtifactProgress(key, {
                                captureId: request.captureId,
                                format: request.format,
                                phase: 'reusing',
                                packetsTotal,
                                packetsWritten: packetsTotal,
                                bytesWritten: cached.finalSize,
                            })
                            return cached
                        }
                    }

                    const cachePaths = yield* destination
                        .cachePaths(request.captureId, request.format)
                        .pipe(Effect.mapError(destinationFailure))
                    yield* Effect.promise(() => rm(cachePaths.partialPath, { force: true }))
                    setArtifactProgress(key, {
                        captureId: request.captureId,
                        format: request.format,
                        phase: 'encoding',
                        packetsTotal,
                        packetsWritten: '0',
                        bytesWritten: '0',
                    })
                    const encoded = yield* encoder
                        .encode({
                            format: request.format,
                            segments: snapshot.segments.map((segment, ordinal) => ({
                                ordinal,
                                ...segment,
                            })),
                            partialPath: cachePaths.partialPath,
                            onProgress: (next) => {
                                setArtifactProgress(key, {
                                    captureId: request.captureId,
                                    format: request.format,
                                    phase: 'encoding',
                                    packetsTotal,
                                    packetsWritten: next.packetsWritten,
                                    bytesWritten: next.bytesWritten,
                                })
                            },
                        })
                        .pipe(
                            Effect.mapError(encodingFailure),
                            Effect.onError(() =>
                                Effect.promise(() =>
                                    rm(cachePaths.partialPath, { force: true }).catch(
                                        () => undefined,
                                    ),
                                ),
                            ),
                        )
                    setArtifactProgress(key, {
                        captureId: request.captureId,
                        format: request.format,
                        phase: 'finalizing',
                        packetsTotal,
                        packetsWritten: encoded.packetsWritten,
                        bytesWritten: encoded.bytesWritten,
                    })
                    yield* Effect.tryPromise({
                        try: async () => {
                            await rm(cachePaths.artifactPath, { force: true })
                            await rename(cachePaths.partialPath, cachePaths.artifactPath)
                        },
                        catch: (cause) =>
                            new ExportUnavailable({
                                title: 'Export finalization failed',
                                message: String(cause),
                                retryable: true,
                            }),
                    })
                    const finalized = yield* Effect.tryPromise({
                        try: () => stat(cachePaths.artifactPath),
                        catch: (cause) =>
                            new ExportUnavailable({
                                title: 'Export validation failed',
                                message: String(cause),
                                retryable: true,
                            }),
                    })
                    if (BigInt(finalized.size) !== BigInt(encoded.finalSize)) {
                        return yield* new ExportUnavailable({
                            title: 'Export validation failed',
                            message: 'The finalized artifact size does not match the encoded size.',
                            retryable: true,
                        })
                    }
                    return yield* stored(
                        artifacts.put({
                            captureId: request.captureId,
                            format: request.format,
                            sourceFingerprint,
                            artifactPath: cachePaths.artifactPath,
                            retainedPortionOnly: snapshot.retainedPortionOnly,
                            checksumSha256: encoded.checksumSha256,
                            finalSize: encoded.finalSize,
                        }),
                    )
                }).pipe(Effect.ensuring(release))
            })

            const sharedArtifact = Effect.fn('ExportScheduler.sharedArtifact')(function* (
                request: CreateExportRequest,
            ) {
                const key = artifactKey(request)
                const fiber = yield* registryLock.withPermits(1)(
                    Effect.gen(function* () {
                        const running = artifactFibers.get(key)
                        if (running) return running
                        const created = yield* Effect.forkIn(
                            ensureArtifact(request).pipe(
                                Effect.ensuring(
                                    Effect.sync(() => {
                                        artifactFibers.delete(key)
                                        if (!artifactSubscribers.has(key))
                                            artifactProgress.delete(key)
                                    }),
                                ),
                            ),
                            applicationScope,
                        )
                        artifactFibers.set(key, created)
                        return created
                    }),
                )
                return yield* Fiber.join(fiber)
            })

            const completeJob = Effect.fn('ExportScheduler.completeJob')(function* (
                exportId: string,
                artifact: CachedExportArtifact,
                destinationKind: 'desktop' | 'server',
            ) {
                const finishedAtNs = (yield* Clock.currentTimeNanos).toString()
                const current = jobs.get(exportId)
                updateJob(exportId, {
                    state: 'completed',
                    phase: 'delivering',
                    packetsWritten: current?.packetsTotal ?? '0',
                    bytesWritten: artifact.finalSize,
                    retainedPortionOnly: artifact.retainedPortionOnly,
                    checksumSha256: artifact.checksumSha256,
                    finalSize: artifact.finalSize,
                    downloadPath:
                        destinationKind === 'server'
                            ? `/exports/${encodeURIComponent(artifact.captureId)}/${artifact.format}/download`
                            : null,
                    failure: null,
                    finishedAtNs,
                })
                terminalOrder.push(exportId)
                pruneTerminalJobs()
            })

            const failJob = Effect.fn('ExportScheduler.failJob')(function* (
                exportId: string,
                error: SchedulerError,
            ) {
                const finishedAtNs = (yield* Clock.currentTimeNanos).toString()
                updateJob(exportId, {
                    state: 'failed',
                    failure: new ExportJobFailure({
                        title: error.title,
                        message: error.message ?? error.title,
                        retryable: error.retryable ?? false,
                    }),
                    finishedAtNs,
                })
                terminalOrder.push(exportId)
                pruneTerminalJobs()
            })

            const runJob = Effect.fn('ExportScheduler.runJob')(function* (
                exportId: string,
                request: CreateExportRequest,
                resolvedDestination: ResolvedExportDestination,
            ) {
                const artifact = yield* sharedArtifact(request)
                const current = jobs.get(exportId)
                updateJob(exportId, {
                    phase: 'delivering',
                    packetsWritten: current?.packetsTotal ?? '0',
                    bytesWritten: artifact.finalSize,
                })
                const destinationKind = yield* destination
                    .deliver(resolvedDestination, artifact.artifactPath)
                    .pipe(Effect.mapError(destinationFailure))
                yield* completeJob(exportId, artifact, destinationKind)
            })

            const guardedJob = (
                exportId: string,
                request: CreateExportRequest,
                resolvedDestination: ResolvedExportDestination,
            ) =>
                runJob(exportId, request, resolvedDestination).pipe(
                    Effect.catchAllCause((cause) => {
                        const failure = Cause.failureOption(cause)
                        if (Option.isSome(failure)) return failJob(exportId, failure.value)
                        return Effect.logError(
                            `Export job terminated unexpectedly: ${Cause.pretty(cause)}`,
                        ).pipe(
                            Effect.zipRight(
                                failJob(
                                    exportId,
                                    new ExportUnavailable({
                                        title: 'Export failed unexpectedly',
                                        message:
                                            'The background export task stopped before completion.',
                                        retryable: true,
                                    }),
                                ),
                            ),
                        )
                    }),
                    Effect.ensuring(
                        Effect.sync(() => {
                            jobFibers.delete(exportId)
                            unsubscribeFromArtifact(artifactKey(request), exportId)
                        }),
                    ),
                )

            const interruptAll = () =>
                Effect.forEach([...jobFibers.values()], Fiber.interrupt, {
                    concurrency: 'unbounded',
                    discard: true,
                }).pipe(
                    Effect.zipRight(
                        Effect.forEach([...artifactFibers.values()], Fiber.interrupt, {
                            concurrency: 'unbounded',
                            discard: true,
                        }),
                    ),
                    Effect.asVoid,
                )

            return ExportScheduler.of({
                create: Effect.fn('ExportScheduler.create')(function* (request) {
                    const capture = yield* validateRequest(request)
                    const resolvedDestination = yield* destination
                        .resolve(request.format, request.destination)
                        .pipe(Effect.mapError(destinationFailure))
                    const exportId = randomBytes(16).toString('hex')
                    const startedAtNs = (yield* Clock.currentTimeNanos).toString()
                    const key = artifactKey(request)
                    const initial = new ExportJob({
                        exportId,
                        captureId: request.captureId,
                        captureStartedAtNs: capture.startedAtNs,
                        format: request.format,
                        destinationKind: resolvedDestination.kind,
                        destinationLabel: request.destinationLabel,
                        state: 'running',
                        phase: 'preparing',
                        packetsTotal: '0',
                        packetsWritten: '0',
                        bytesWritten: '0',
                        estimatedBytes: capture.retainedBytes,
                        retainedPortionOnly: null,
                        checksumSha256: null,
                        finalSize: null,
                        downloadPath: null,
                        failure: null,
                        startedAtNs,
                        finishedAtNs: null,
                    })
                    jobs.set(exportId, initial)
                    subscribeToArtifact(key, exportId)

                    const gate = yield* Deferred.make<void>()
                    const fiber = yield* Effect.forkIn(
                        Deferred.await(gate).pipe(
                            Effect.zipRight(guardedJob(exportId, request, resolvedDestination)),
                        ),
                        applicationScope,
                    )
                    jobFibers.set(exportId, fiber)
                    yield* Deferred.succeed(gate, undefined)
                    return jobs.get(exportId) ?? initial
                }),
                list: () =>
                    Effect.sync(
                        () =>
                            new ExportJobList({
                                exports: [...jobs.values()].sort(compareJobs),
                            }),
                    ),
                cancelAll: interruptAll,
                interruptAll,
                status: () =>
                    Effect.sync(() => ({
                        activeExportIds: [...jobs.values()]
                            .filter((job) => job.state === 'running')
                            .map((job) => job.exportId),
                    })),
            })
        }),
    )
}

import { randomBytes } from 'node:crypto'
import { rename, rm, stat } from 'node:fs/promises'

import {
    CaptureNotFound,
    CaptureStorageUnavailable,
    ExportNotFound,
    ExportOptionsInvalid,
    ExportUnavailable,
    type CreateExportRequest,
    type ExportJob,
    type ExportJobList,
    type CaptureRpcError,
} from '@repo/shared/capture'
import { Clock, Context, Duration, Effect, Fiber, Layer, Schedule, Schema } from 'effect'

import { CaptureCatalog } from './catalog'
import { ExportDestination, type ExportDestinationError } from './export-destination'
import { ExportEncoder, type ExportEncodingError, type ExportProgress } from './export-encoder'
import {
    ExportJobRepository,
    ExportRepositoryError,
    StoredExportNotFound,
} from './export-repository'
import { CaptureSessionManager } from './manager'
import { Capture } from './service'

type SchedulerError = Schema.Schema.Type<typeof CaptureRpcError>

function repositoryFailure(error: ExportRepositoryError | StoredExportNotFound): SchedulerError {
    return error._tag === 'StoredExportNotFound'
        ? new ExportNotFound({ title: 'Export not found' })
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

function remove(path: string | null | undefined) {
    return path
        ? Effect.tryPromise({
              try: () => rm(path, { force: true }),
              catch: (cause) =>
                  new ExportUnavailable({
                      title: 'Export cleanup failed',
                      message: String(cause),
                      retryable: true,
                  }),
          })
        : Effect.void
}

export interface ExportSchedulerStatus {
    readonly activeExportIds: ReadonlyArray<string>
}

export interface ExportSchedulerService {
    readonly create: (request: CreateExportRequest) => Effect.Effect<ExportJob, SchedulerError>
    readonly get: (exportId: string) => Effect.Effect<ExportJob, SchedulerError>
    readonly list: (captureId?: string) => Effect.Effect<ExportJobList, SchedulerError>
    readonly cancel: (exportId: string) => Effect.Effect<ExportJob, SchedulerError>
    readonly retry: (exportId: string) => Effect.Effect<ExportJob, SchedulerError>
    readonly deleteArtifact: (exportId: string) => Effect.Effect<ExportJob, SchedulerError>
    readonly cancelAll: () => Effect.Effect<void, SchedulerError>
    readonly interruptAll: () => Effect.Effect<void, SchedulerError>
    readonly status: () => Effect.Effect<ExportSchedulerStatus>
}

export class ExportScheduler extends Context.Tag('@repo/core/capture/ExportScheduler')<
    ExportScheduler,
    ExportSchedulerService
>() {
    static readonly layer = Layer.scoped(
        ExportScheduler,
        Effect.gen(function* () {
            const repository = yield* ExportJobRepository
            const catalog = yield* CaptureCatalog
            const destination = yield* ExportDestination
            const encoder = yield* ExportEncoder
            const captureService = yield* Capture
            yield* CaptureSessionManager
            const applicationScope = yield* Effect.scope
            const fibers = new Map<string, Fiber.RuntimeFiber<void, never>>()

            const stored = <A>(
                effect: Effect.Effect<A, ExportRepositoryError | StoredExportNotFound>,
            ) => effect.pipe(Effect.mapError(repositoryFailure))

            const terminalCleanup = Effect.fn('ExportScheduler.terminalCleanup')(function* (
                exportId: string,
                state: 'failed' | 'cancelled',
                failure?: SchedulerError,
            ) {
                const paths = yield* stored(repository.paths(exportId))
                const job = yield* stored(repository.get(exportId))
                const nativeLease = yield* stored(repository.nativeLease(exportId))
                yield* remove(paths.partialPath).pipe(Effect.ignore)
                yield* remove(paths.artifactPath).pipe(Effect.ignore)
                const now = (yield* Clock.currentTimeNanos).toString()
                yield* stored(
                    repository.update(exportId, state, {
                        completedAtNs: now,
                        failureCode: failure?._tag ?? null,
                        failureMessage: failure?.message ?? null,
                    }),
                ).pipe(Effect.ignore)
                if (nativeLease.token) {
                    yield* captureService
                        .releaseSegmentSnapshot(nativeLease.captureId, nativeLease.token)
                        .pipe(Effect.ignore)
                }
                yield* repository.releaseLeases(exportId).pipe(Effect.ignore)
                yield* catalog.finalizeDeferred(job.captureId).pipe(Effect.ignore)
            })

            const run = (exportId: string) =>
                Effect.scoped(
                    Effect.gen(function* () {
                        const job = yield* stored(repository.get(exportId))
                        const paths = yield* stored(repository.paths(exportId))
                        if (!paths.artifactPath || !paths.partialPath) {
                            return yield* new ExportUnavailable({
                                title: 'Export destination is unavailable',
                            })
                        }
                        const artifactPath = paths.artifactPath
                        const partialPath = paths.partialPath
                        yield* remove(partialPath)
                        const finalExists = yield* Effect.promise(() =>
                            stat(artifactPath)
                                .then(() => true)
                                .catch(() => false),
                        )
                        if (finalExists) {
                            return yield* new ExportUnavailable({
                                title: 'Export destination already exists',
                                message: 'The exporter will not overwrite an existing artifact.',
                            })
                        }
                        const startedAtNs = (yield* Clock.currentTimeNanos).toString()
                        yield* stored(repository.update(exportId, 'preparing', { startedAtNs }))
                        const source = yield* stored(repository.source(exportId))
                        yield* stored(repository.update(exportId, 'running'))
                        let progress: ExportProgress = {
                            packetsWritten: '0',
                            bytesWritten: '0',
                        }
                        yield* Effect.forkScoped(
                            Effect.gen(function* () {
                                yield* stored(repository.update(exportId, 'running', progress))
                            }).pipe(
                                Effect.repeat(Schedule.spaced(Duration.seconds(1))),
                                Effect.ignore,
                            ),
                        )
                        const encoded = yield* encoder
                            .encode({
                                format: job.format,
                                segments: source,
                                partialPath,
                                onProgress: (next) => {
                                    progress = next
                                },
                            })
                            .pipe(Effect.mapError(encodingFailure))
                        yield* stored(
                            repository.update(exportId, 'finalizing', {
                                packetsWritten: encoded.packetsWritten,
                                bytesWritten: encoded.bytesWritten,
                            }),
                        )
                        yield* Effect.tryPromise({
                            try: () => rename(partialPath, artifactPath),
                            catch: (cause) =>
                                new ExportUnavailable({
                                    title: 'Export finalization failed',
                                    message: String(cause),
                                    retryable: true,
                                }),
                        })
                        const finalized = yield* Effect.tryPromise({
                            try: () => stat(artifactPath),
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
                                message:
                                    'The finalized artifact size does not match the encoded size.',
                                retryable: true,
                            })
                        }
                        const completedAtNs = (yield* Clock.currentTimeNanos).toString()
                        yield* stored(
                            repository.update(exportId, 'completed', {
                                packetsWritten: encoded.packetsWritten,
                                bytesWritten: encoded.bytesWritten,
                                checksumSha256: encoded.checksumSha256,
                                finalSize: encoded.finalSize,
                                completedAtNs,
                                partialPath: null,
                            }),
                        )
                        const nativeLease = yield* stored(repository.nativeLease(exportId))
                        if (nativeLease.token) {
                            yield* captureService
                                .releaseSegmentSnapshot(nativeLease.captureId, nativeLease.token)
                                .pipe(Effect.ignore)
                        }
                        yield* repository
                            .releaseLeases(exportId)
                            .pipe(Effect.mapError(repositoryFailure))
                        yield* catalog.finalizeDeferred(job.captureId).pipe(Effect.ignore)
                    }),
                ).pipe(
                    Effect.onInterrupt(() =>
                        terminalCleanup(exportId, 'cancelled').pipe(
                            Effect.catchAll(() => Effect.void),
                        ),
                    ),
                    Effect.catchAll((error) =>
                        terminalCleanup(exportId, 'failed', error).pipe(
                            Effect.catchAll(() => Effect.void),
                        ),
                    ),
                    Effect.asVoid,
                    Effect.ensuring(
                        Effect.sync(() => {
                            fibers.delete(exportId)
                        }),
                    ),
                )

            const start = Effect.fn('ExportScheduler.start')(function* (exportId: string) {
                if (fibers.has(exportId)) return
                const fiber = yield* Effect.forkIn(run(exportId), applicationScope)
                fibers.set(exportId, fiber)
            })

            const recoverable = yield* repository
                .interruptedServerJobs()
                .pipe(Effect.mapError(repositoryFailure))
            for (const job of recoverable.exports) {
                if (job.state === 'interrupted') {
                    yield* stored(repository.prepareRetry(job.exportId)).pipe(Effect.ignore)
                }
                yield* start(job.exportId)
            }

            return ExportScheduler.of({
                create: Effect.fn('ExportScheduler.create')(function* (request) {
                    const existing = yield* repository
                        .findByIdempotencyKey(request.idempotencyKey)
                        .pipe(Effect.mapError(repositoryFailure))
                    if (existing) return existing
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
                    const exportId = randomBytes(16).toString('hex')
                    const nativeLease =
                        capture.state === 'capturing' || capture.state === 'stopping'
                            ? yield* captureService.leaseSegmentSnapshot(request.captureId)
                            : undefined
                    const job = yield* Effect.gen(function* () {
                        const prepared = yield* destination
                            .prepare(exportId, request.format, request.destination)
                            .pipe(Effect.mapError(destinationFailure))
                        return yield* stored(
                            repository.create({
                                exportId,
                                captureId: request.captureId,
                                idempotencyKey: request.idempotencyKey,
                                format: request.format,
                                nativeLeaseToken: nativeLease?.leaseToken,
                                sourceSegments: nativeLease?.segments.map((segment, ordinal) => ({
                                    ordinal,
                                    ...segment,
                                })),
                                ...prepared,
                            }),
                        )
                    }).pipe(
                        Effect.onError(() =>
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
                    yield* start(job.exportId)
                    return job
                }),
                get: (exportId) => stored(repository.get(exportId)),
                list: (captureId) =>
                    repository.list(captureId).pipe(Effect.mapError(repositoryFailure)),
                cancel: Effect.fn('ExportScheduler.cancel')(function* (exportId) {
                    const job = yield* stored(repository.requestCancel(exportId))
                    const fiber = fibers.get(exportId)
                    if (fiber) yield* Fiber.interrupt(fiber)
                    else if (job.state === 'interrupted') {
                        yield* terminalCleanup(exportId, 'cancelled')
                    }
                    return job.state === 'completed' ||
                        job.state === 'failed' ||
                        job.state === 'cancelled'
                        ? job
                        : yield* stored(repository.get(exportId))
                }),
                retry: Effect.fn('ExportScheduler.retry')(function* (exportId) {
                    const job = yield* stored(repository.get(exportId))
                    if (job.destinationKind === 'desktop') {
                        return yield* new ExportOptionsInvalid({
                            title: 'Select a new desktop destination',
                            message:
                                'Desktop retries require a new export request and a new native save destination.',
                        })
                    }
                    const retried = yield* stored(repository.prepareRetry(exportId))
                    yield* start(exportId)
                    return retried
                }),
                deleteArtifact: Effect.fn('ExportScheduler.deleteArtifact')(function* (exportId) {
                    const job = yield* stored(repository.get(exportId))
                    if (job.destinationKind !== 'server' || job.state !== 'completed') {
                        return yield* new ExportOptionsInvalid({
                            title: 'Export artifact cannot be deleted',
                            message:
                                'Only completed server artifacts can be deleted through this API.',
                        })
                    }
                    const paths = yield* stored(repository.paths(exportId))
                    yield* remove(paths.artifactPath)
                    return yield* stored(
                        repository.update(exportId, 'completed', { artifactPath: null }),
                    )
                }),
                cancelAll: Effect.fn('ExportScheduler.cancelAll')(function* () {
                    const ids = [...fibers.keys()]
                    yield* Effect.forEach(ids, (id) =>
                        repository.requestCancel(id).pipe(Effect.ignore),
                    )
                    yield* Effect.forEach([...fibers.values()], Fiber.interrupt, {
                        concurrency: 'unbounded',
                    })
                }),
                interruptAll: Effect.fn('ExportScheduler.interruptAll')(function* () {
                    const ids = [...fibers.keys()]
                    yield* Effect.forEach([...fibers.values()], Fiber.interrupt, {
                        concurrency: 'unbounded',
                    })
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* Effect.forEach(ids, (id) =>
                        repository
                            .update(id, 'interrupted', {
                                failureCode: 'BackendInterrupted',
                                failureMessage: 'The backend stopped before export completion.',
                                completedAtNs: now,
                            })
                            .pipe(Effect.ignore),
                    )
                }),
                status: () => Effect.sync(() => ({ activeExportIds: [...fibers.keys()] })),
            })
        }),
    )
}

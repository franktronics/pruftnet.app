import { createHash } from 'node:crypto'
import { rename, rm, stat } from 'node:fs/promises'

import {
    CaptureNotFound,
    CaptureStorageUnavailable,
    ExportOptionsInvalid,
    ExportProgress,
    ExportUnavailable,
    PreparedExport,
    type CaptureRpcError,
    type CreateExportRequest,
} from '@repo/shared/capture'
import { Context, Effect, Fiber, Layer, Schema } from 'effect'

import { CaptureCatalog } from './catalog'
import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
    type ExportSnapshot,
} from './capture-session-repository'
import { ExportDestination, type ExportDestinationError } from './export-destination'
import { ExportEncoder, type ExportEncodingError } from './export-encoder'
import {
    ExportArtifactRepository,
    ExportRepositoryError,
    type CachedExportArtifact,
} from './export-repository'
import { CaptureSessionManager } from './manager'
import { Capture } from './service'

type SchedulerError = Schema.Schema.Type<typeof CaptureRpcError>

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

export interface ExportSchedulerStatus {
    readonly activeExportIds: ReadonlyArray<string>
}

export interface ExportSchedulerService {
    readonly create: (request: CreateExportRequest) => Effect.Effect<PreparedExport, SchedulerError>
    readonly progress: (captureId: string) => Effect.Effect<ExportProgress | null>
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
            const fibers = new Map<
                string,
                Fiber.RuntimeFiber<CachedExportArtifact, SchedulerError>
            >()
            const progress = new Map<string, ExportProgress>()

            const setProgress = (
                key: string,
                value: ConstructorParameters<typeof ExportProgress>[0],
            ) => {
                progress.set(key, new ExportProgress(value))
            }

            const stored = <A>(
                effect: Effect.Effect<
                    A,
                    ExportRepositoryError | CaptureRepositoryError | StoredCaptureNotFound
                >,
            ) => effect.pipe(Effect.mapError(repositoryFailure))

            const ensureArtifact = Effect.fn('ExportScheduler.ensureArtifact')(function* (
                request: CreateExportRequest,
            ) {
                const key = `${request.captureId}:${request.format}`
                setProgress(key, {
                    captureId: request.captureId,
                    format: request.format,
                    phase: 'preparing',
                    packetsTotal: '0',
                    packetsWritten: '0',
                    bytesWritten: '0',
                })
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
                    const snapshot = yield* stored(
                        captures.acquireExportSnapshot(
                            request.captureId,
                            nativeLease?.segments.map((segment) => segment.generation),
                        ),
                    )
                    return snapshot
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
                            setProgress(key, {
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
                    setProgress(key, {
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
                                setProgress(key, {
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
                    setProgress(key, {
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
                const key = `${request.captureId}:${request.format}`
                const fiber = yield* registryLock.withPermits(1)(
                    Effect.gen(function* () {
                        const running = fibers.get(key)
                        if (running) return running
                        const created = yield* Effect.forkIn(
                            ensureArtifact(request).pipe(
                                Effect.ensuring(
                                    Effect.sync(() => {
                                        fibers.delete(key)
                                    }),
                                ),
                            ),
                            applicationScope,
                        )
                        fibers.set(key, created)
                        return created
                    }),
                )
                return yield* Fiber.join(fiber)
            })

            const interruptAll = () =>
                Effect.forEach([...fibers.values()], Fiber.interrupt, {
                    concurrency: 'unbounded',
                    discard: true,
                })

            return ExportScheduler.of({
                create: Effect.fn('ExportScheduler.create')(function* (request) {
                    const key = `${request.captureId}:${request.format}`
                    return yield* Effect.gen(function* () {
                        const artifact = yield* sharedArtifact(request)
                        const current = progress.get(key)
                        setProgress(key, {
                            captureId: artifact.captureId,
                            format: artifact.format,
                            phase: 'delivering',
                            packetsTotal: current?.packetsTotal ?? '0',
                            packetsWritten: current?.packetsTotal ?? '0',
                            bytesWritten: artifact.finalSize,
                        })
                        const destinationKind = yield* destination
                            .deliver(request.format, request.destination, artifact.artifactPath)
                            .pipe(Effect.mapError(destinationFailure))
                        return new PreparedExport({
                            captureId: artifact.captureId,
                            format: artifact.format,
                            destinationKind,
                            retainedPortionOnly: artifact.retainedPortionOnly,
                            checksumSha256: artifact.checksumSha256,
                            finalSize: artifact.finalSize,
                            downloadPath:
                                destinationKind === 'server'
                                    ? `/exports/${encodeURIComponent(artifact.captureId)}/${artifact.format}/download`
                                    : null,
                        })
                    }).pipe(
                        Effect.ensuring(
                            Effect.sync(() => {
                                progress.delete(key)
                            }),
                        ),
                    )
                }),
                progress: (captureId) =>
                    Effect.sync(
                        () =>
                            [...progress.values()].find((item) => item.captureId === captureId) ??
                            null,
                    ),
                cancelAll: interruptAll,
                interruptAll,
                status: () =>
                    Effect.sync(() => ({
                        activeExportIds: [...new Set([...fibers.keys(), ...progress.keys()])],
                    })),
            })
        }),
    )
}

import {
    ExportFailure,
    ExportJob,
    ExportJobList,
    type ExportFormat,
    type ExportState,
} from '@repo/shared/capture'
import { isAbsolute } from 'node:path'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { Clock, Context, Data, Effect, Layer } from 'effect'

import {
    captureSegments,
    AppDataPaths,
    Database,
    exportJobSegments,
    exportJobs,
    type DatabaseError,
} from '#core/storage'

export class ExportRepositoryError extends Data.TaggedError('ExportRepositoryError')<{
    readonly operation: string
    readonly message: string
    readonly cause?: unknown
}> {}

export class StoredExportNotFound extends Data.TaggedError('StoredExportNotFound')<{
    readonly exportId: string
}> {}

type RepositoryError = ExportRepositoryError | StoredExportNotFound
type ExportRow = typeof exportJobs.$inferSelect

export interface ExportSourceSegment {
    readonly ordinal: number
    readonly generation: number
    readonly path: string
    readonly committedBytes: string
    readonly committedPackets: string
}

export interface CreateStoredExport {
    readonly exportId: string
    readonly captureId: string
    readonly idempotencyKey: string
    readonly format: ExportFormat
    readonly destinationKind: 'desktop' | 'server'
    readonly destinationToken?: string
    readonly artifactPath: string
    readonly partialPath: string
    readonly nativeLeaseToken?: string
    readonly sourceSegments?: ReadonlyArray<
        ExportSourceSegment & {
            readonly firstPacketId: string
            readonly lastPacketId: string
            readonly evicted: boolean
        }
    >
}

function repositoryError(operation: string, cause: DatabaseError | unknown) {
    return new ExportRepositoryError({
        operation,
        message: `Export repository operation failed: ${operation}`,
        cause,
    })
}

function decodeJob(row: ExportRow) {
    return new ExportJob({
        exportId: row.id,
        captureId: row.captureId,
        state: row.state,
        format: row.format,
        destinationKind: row.destinationKind,
        packetsTotal: row.packetsTotal,
        packetsWritten: row.packetsWritten,
        bytesWritten: row.bytesWritten,
        retainedPortionOnly: row.retainedPortionOnly,
        cancelRequested: row.cancelRequested,
        checksumSha256: row.checksumSha256,
        finalSize: row.finalSize,
        failure:
            row.failureCode && row.failureMessage
                ? new ExportFailure({
                      code: row.failureCode,
                      message: row.failureMessage,
                      retryable: row.state === 'failed' || row.state === 'interrupted',
                  })
                : null,
        createdAtNs: row.createdAtNs,
        startedAtNs: row.startedAtNs,
        completedAtNs: row.completedAtNs,
        artifactAvailable: row.artifactPath !== null,
        downloadPath:
            row.destinationKind === 'server' && row.state === 'completed' && row.artifactPath
                ? `/exports/${encodeURIComponent(row.id)}/download`
                : null,
    })
}

export interface ExportJobRepositoryService {
    readonly create: (input: CreateStoredExport) => Effect.Effect<ExportJob, RepositoryError>
    readonly get: (exportId: string) => Effect.Effect<ExportJob, RepositoryError>
    readonly findByIdempotencyKey: (
        idempotencyKey: string,
    ) => Effect.Effect<ExportJob | undefined, ExportRepositoryError>
    readonly list: (captureId?: string) => Effect.Effect<ExportJobList, ExportRepositoryError>
    readonly source: (
        exportId: string,
    ) => Effect.Effect<ReadonlyArray<ExportSourceSegment>, RepositoryError>
    readonly update: (
        exportId: string,
        state: ExportState,
        values?: Partial<{
            packetsWritten: string
            bytesWritten: string
            checksumSha256: string | null
            finalSize: string | null
            failureCode: string | null
            failureMessage: string | null
            startedAtNs: string | null
            completedAtNs: string | null
            cancelRequested: boolean
            artifactPath: string | null
            partialPath: string | null
        }>,
    ) => Effect.Effect<ExportJob, RepositoryError>
    readonly requestCancel: (exportId: string) => Effect.Effect<ExportJob, RepositoryError>
    readonly releaseLeases: (exportId: string) => Effect.Effect<void, ExportRepositoryError>
    readonly prepareRetry: (exportId: string) => Effect.Effect<ExportJob, RepositoryError>
    readonly interruptedServerJobs: () => Effect.Effect<ExportJobList, ExportRepositoryError>
    readonly paths: (
        exportId: string,
    ) => Effect.Effect<{ artifactPath: string | null; partialPath: string | null }, RepositoryError>
    readonly nativeLease: (
        exportId: string,
    ) => Effect.Effect<{ captureId: string; token: string | null }, RepositoryError>
}

export class ExportJobRepository extends Context.Tag('@repo/core/capture/ExportJobRepository')<
    ExportJobRepository,
    ExportJobRepositoryService
>() {
    static readonly layer = Layer.effect(
        ExportJobRepository,
        Effect.gen(function* () {
            const database = yield* Database
            const paths = yield* AppDataPaths
            const get = Effect.fn('ExportJobRepository.get')(function* (exportId: string) {
                const row = yield* database
                    .read('get export', (db) =>
                        db.select().from(exportJobs).where(eq(exportJobs.id, exportId)).get(),
                    )
                    .pipe(Effect.mapError((cause) => repositoryError('get export', cause)))
                if (!row) return yield* new StoredExportNotFound({ exportId })
                return decodeJob(row)
            })

            return ExportJobRepository.of({
                findByIdempotencyKey: Effect.fn('ExportJobRepository.findByIdempotencyKey')(
                    function* (idempotencyKey) {
                        const row = yield* database
                            .read('find export by idempotency key', (db) =>
                                db
                                    .select()
                                    .from(exportJobs)
                                    .where(eq(exportJobs.idempotencyKey, idempotencyKey))
                                    .get(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('find export by idempotency key', cause),
                                ),
                            )
                        return row ? decodeJob(row) : undefined
                    },
                ),
                create: Effect.fn('ExportJobRepository.create')(function* (input) {
                    const existing = yield* database
                        .read('find idempotent export', (db) =>
                            db
                                .select()
                                .from(exportJobs)
                                .where(eq(exportJobs.idempotencyKey, input.idempotencyKey))
                                .get(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('find idempotent export', cause),
                            ),
                        )
                    if (existing) return decodeJob(existing)
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* database
                        .write('create export snapshot', (db) =>
                            db.transaction((transaction) => {
                                if (input.sourceSegments) {
                                    for (const segment of input.sourceSegments) {
                                        transaction
                                            .insert(captureSegments)
                                            .values({
                                                captureId: input.captureId,
                                                generation: segment.generation,
                                                path: paths.resolveCaptureSegmentPath(
                                                    input.captureId,
                                                    segment.path,
                                                ),
                                                committedBytes: segment.committedBytes,
                                                committedPackets: segment.committedPackets,
                                                firstPacketId:
                                                    segment.firstPacketId === '0'
                                                        ? null
                                                        : segment.firstPacketId,
                                                lastPacketId:
                                                    segment.lastPacketId === '0'
                                                        ? null
                                                        : segment.lastPacketId,
                                                evicted: false,
                                                createdAtNs: now,
                                            })
                                            .onConflictDoUpdate({
                                                target: [
                                                    captureSegments.captureId,
                                                    captureSegments.generation,
                                                ],
                                                set: {
                                                    committedBytes: segment.committedBytes,
                                                    committedPackets: segment.committedPackets,
                                                    firstPacketId:
                                                        segment.firstPacketId === '0'
                                                            ? null
                                                            : segment.firstPacketId,
                                                    lastPacketId:
                                                        segment.lastPacketId === '0'
                                                            ? null
                                                            : segment.lastPacketId,
                                                    evicted: false,
                                                    valid: true,
                                                },
                                            })
                                            .run()
                                    }
                                }
                                const baseCondition = and(
                                    eq(captureSegments.captureId, input.captureId),
                                    eq(captureSegments.valid, true),
                                    eq(captureSegments.evicted, false),
                                )
                                const segments = transaction
                                    .select()
                                    .from(captureSegments)
                                    .where(
                                        input.sourceSegments
                                            ? and(
                                                  baseCondition,
                                                  inArray(
                                                      captureSegments.generation,
                                                      input.sourceSegments.map(
                                                          (segment) => segment.generation,
                                                      ),
                                                  ),
                                              )
                                            : baseCondition,
                                    )
                                    .orderBy(asc(captureSegments.generation))
                                    .all()
                                if (segments.length === 0) {
                                    throw new Error('The capture has no committed source segments.')
                                }
                                const evicted = transaction
                                    .select({ value: count() })
                                    .from(captureSegments)
                                    .where(
                                        and(
                                            eq(captureSegments.captureId, input.captureId),
                                            eq(captureSegments.evicted, true),
                                        ),
                                    )
                                    .get()
                                const packetsTotal = segments
                                    .reduce(
                                        (total, segment) =>
                                            total + BigInt(segment.committedPackets),
                                        0n,
                                    )
                                    .toString()
                                transaction
                                    .insert(exportJobs)
                                    .values({
                                        id: input.exportId,
                                        captureId: input.captureId,
                                        idempotencyKey: input.idempotencyKey,
                                        state: 'queued',
                                        format: input.format,
                                        destinationKind: input.destinationKind,
                                        destinationToken: input.destinationToken,
                                        nativeLeaseToken: input.nativeLeaseToken,
                                        artifactPath: input.artifactPath,
                                        partialPath: input.partialPath,
                                        packetsTotal,
                                        retainedPortionOnly: (evicted?.value ?? 0) > 0,
                                        createdAtNs: now,
                                        updatedAtNs: now,
                                    })
                                    .run()
                                transaction
                                    .insert(exportJobSegments)
                                    .values(
                                        segments.map((segment, ordinal) => ({
                                            exportId: input.exportId,
                                            ordinal,
                                            captureId: input.captureId,
                                            generation: segment.generation,
                                            committedBytes: segment.committedBytes,
                                            committedPackets: segment.committedPackets,
                                        })),
                                    )
                                    .run()
                                for (const segment of segments) {
                                    transaction
                                        .update(captureSegments)
                                        .set({
                                            leaseCount: sql`${captureSegments.leaseCount} + 1`,
                                        })
                                        .where(
                                            and(
                                                eq(captureSegments.captureId, input.captureId),
                                                eq(captureSegments.generation, segment.generation),
                                            ),
                                        )
                                        .run()
                                }
                            }),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('create export snapshot', cause),
                            ),
                        )
                    return yield* get(input.exportId)
                }),
                get,
                list: Effect.fn('ExportJobRepository.list')(function* (captureId) {
                    const rows = yield* database
                        .read('list exports', (db) => {
                            const query = db.select().from(exportJobs)
                            return (
                                captureId ? query.where(eq(exportJobs.captureId, captureId)) : query
                            )
                                .orderBy(
                                    desc(sql`length(${exportJobs.createdAtNs})`),
                                    desc(exportJobs.createdAtNs),
                                )
                                .all()
                        })
                        .pipe(Effect.mapError((cause) => repositoryError('list exports', cause)))
                    return new ExportJobList({ exports: rows.map(decodeJob) })
                }),
                source: Effect.fn('ExportJobRepository.source')(function* (exportId) {
                    yield* get(exportId)
                    return yield* database
                        .read('read export snapshot', (db) =>
                            db
                                .select({
                                    ordinal: exportJobSegments.ordinal,
                                    generation: exportJobSegments.generation,
                                    path: captureSegments.path,
                                    committedBytes: exportJobSegments.committedBytes,
                                    committedPackets: exportJobSegments.committedPackets,
                                })
                                .from(exportJobSegments)
                                .innerJoin(
                                    captureSegments,
                                    and(
                                        eq(captureSegments.captureId, exportJobSegments.captureId),
                                        eq(
                                            captureSegments.generation,
                                            exportJobSegments.generation,
                                        ),
                                    ),
                                )
                                .where(eq(exportJobSegments.exportId, exportId))
                                .orderBy(asc(exportJobSegments.ordinal))
                                .all(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('read export snapshot', cause),
                            ),
                        )
                }),
                update: Effect.fn('ExportJobRepository.update')(function* (
                    exportId,
                    state,
                    values = {},
                ) {
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* database
                        .write('update export', (db) =>
                            db
                                .update(exportJobs)
                                .set({ state, ...values, updatedAtNs: now })
                                .where(eq(exportJobs.id, exportId))
                                .run(),
                        )
                        .pipe(Effect.mapError((cause) => repositoryError('update export', cause)))
                    return yield* get(exportId)
                }),
                requestCancel: Effect.fn('ExportJobRepository.requestCancel')(function* (exportId) {
                    const job = yield* get(exportId)
                    if (['completed', 'failed', 'cancelled'].includes(job.state)) return job
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* database
                        .write('request export cancellation', (db) =>
                            db
                                .update(exportJobs)
                                .set({ cancelRequested: true, updatedAtNs: now })
                                .where(eq(exportJobs.id, exportId))
                                .run(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('request export cancellation', cause),
                            ),
                        )
                    return yield* get(exportId)
                }),
                releaseLeases: Effect.fn('ExportJobRepository.releaseLeases')(function* (exportId) {
                    yield* database
                        .write('release export leases', (db) =>
                            db.transaction((transaction) => {
                                const exportJob = transaction
                                    .select({
                                        leasesReleased: exportJobs.leasesReleased,
                                    })
                                    .from(exportJobs)
                                    .where(eq(exportJobs.id, exportId))
                                    .get()
                                if (!exportJob || exportJob.leasesReleased) return
                                const snapshots = transaction
                                    .select()
                                    .from(exportJobSegments)
                                    .where(eq(exportJobSegments.exportId, exportId))
                                    .all()
                                for (const snapshot of snapshots) {
                                    transaction
                                        .update(captureSegments)
                                        .set({
                                            leaseCount: sql`max(${captureSegments.leaseCount} - 1, 0)`,
                                        })
                                        .where(
                                            and(
                                                eq(captureSegments.captureId, snapshot.captureId),
                                                eq(captureSegments.generation, snapshot.generation),
                                            ),
                                        )
                                        .run()
                                }
                                transaction
                                    .update(exportJobs)
                                    .set({ leasesReleased: true })
                                    .where(eq(exportJobs.id, exportId))
                                    .run()
                            }),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('release export leases', cause),
                            ),
                        )
                }),
                prepareRetry: Effect.fn('ExportJobRepository.prepareRetry')(function* (exportId) {
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* database
                        .write('prepare export retry', (db) =>
                            db.transaction((transaction) => {
                                const job = transaction
                                    .select()
                                    .from(exportJobs)
                                    .where(eq(exportJobs.id, exportId))
                                    .get()
                                if (!job) throw new Error('Export not found.')
                                if (!['failed', 'interrupted'].includes(job.state)) {
                                    throw new Error(`Export cannot be retried from ${job.state}.`)
                                }
                                if (job.leasesReleased) {
                                    const snapshots = transaction
                                        .select()
                                        .from(exportJobSegments)
                                        .where(eq(exportJobSegments.exportId, exportId))
                                        .all()
                                    for (const snapshot of snapshots) {
                                        transaction
                                            .update(captureSegments)
                                            .set({
                                                leaseCount: sql`${captureSegments.leaseCount} + 1`,
                                            })
                                            .where(
                                                and(
                                                    eq(
                                                        captureSegments.captureId,
                                                        snapshot.captureId,
                                                    ),
                                                    eq(
                                                        captureSegments.generation,
                                                        snapshot.generation,
                                                    ),
                                                    eq(captureSegments.valid, true),
                                                    eq(captureSegments.evicted, false),
                                                ),
                                            )
                                            .run()
                                    }
                                    const leased = transaction
                                        .select({ value: count() })
                                        .from(captureSegments)
                                        .innerJoin(
                                            exportJobSegments,
                                            and(
                                                eq(
                                                    captureSegments.captureId,
                                                    exportJobSegments.captureId,
                                                ),
                                                eq(
                                                    captureSegments.generation,
                                                    exportJobSegments.generation,
                                                ),
                                            ),
                                        )
                                        .where(
                                            and(
                                                eq(exportJobSegments.exportId, exportId),
                                                eq(captureSegments.valid, true),
                                                eq(captureSegments.evicted, false),
                                            ),
                                        )
                                        .get()
                                    const expected = transaction
                                        .select({ value: count() })
                                        .from(exportJobSegments)
                                        .where(eq(exportJobSegments.exportId, exportId))
                                        .get()
                                    if ((leased?.value ?? 0) !== (expected?.value ?? 0)) {
                                        throw new Error(
                                            'The immutable export source is unavailable.',
                                        )
                                    }
                                }
                                transaction
                                    .update(exportJobs)
                                    .set({
                                        state: 'queued',
                                        leasesReleased: false,
                                        cancelRequested: false,
                                        packetsWritten: '0',
                                        bytesWritten: '0',
                                        checksumSha256: null,
                                        finalSize: null,
                                        failureCode: null,
                                        failureMessage: null,
                                        startedAtNs: null,
                                        completedAtNs: null,
                                        updatedAtNs: now,
                                    })
                                    .where(eq(exportJobs.id, exportId))
                                    .run()
                            }),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('prepare export retry', cause),
                            ),
                        )
                    return yield* get(exportId)
                }),
                interruptedServerJobs: Effect.fn('ExportJobRepository.interruptedServerJobs')(
                    function* () {
                        const rows = yield* database
                            .read('list interrupted server exports', (db) =>
                                db
                                    .select()
                                    .from(exportJobs)
                                    .where(
                                        and(
                                            eq(exportJobs.destinationKind, 'server'),
                                            inArray(exportJobs.state, ['interrupted', 'queued']),
                                        ),
                                    )
                                    .all(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('list interrupted server exports', cause),
                                ),
                            )
                        return new ExportJobList({ exports: rows.map(decodeJob) })
                    },
                ),
                paths: Effect.fn('ExportJobRepository.paths')(function* (exportId) {
                    const row = yield* database
                        .read('read export paths', (db) =>
                            db
                                .select({
                                    destinationKind: exportJobs.destinationKind,
                                    artifactPath: exportJobs.artifactPath,
                                    partialPath: exportJobs.partialPath,
                                })
                                .from(exportJobs)
                                .where(eq(exportJobs.id, exportId))
                                .get(),
                        )
                        .pipe(
                            Effect.mapError((cause) => repositoryError('read export paths', cause)),
                        )
                    if (!row) return yield* new StoredExportNotFound({ exportId })
                    return yield* Effect.try({
                        try: () => {
                            if (row.destinationKind === 'server') {
                                return {
                                    artifactPath: row.artifactPath
                                        ? paths.resolveExportArtifactPath(exportId, row.artifactPath)
                                        : null,
                                    partialPath: row.partialPath
                                        ? paths.resolveExportArtifactPath(exportId, row.partialPath)
                                        : null,
                                }
                            }
                            if (
                                (row.artifactPath && !isAbsolute(row.artifactPath)) ||
                                (row.partialPath && !isAbsolute(row.partialPath))
                            ) {
                                throw new Error('A desktop export path is not absolute.')
                            }
                            return {
                                artifactPath: row.artifactPath,
                                partialPath: row.partialPath,
                            }
                        },
                        catch: (cause) => repositoryError('validate export paths', cause),
                    })
                }),
                nativeLease: Effect.fn('ExportJobRepository.nativeLease')(function* (exportId) {
                    const row = yield* database
                        .read('read native export lease', (db) =>
                            db
                                .select({
                                    captureId: exportJobs.captureId,
                                    token: exportJobs.nativeLeaseToken,
                                })
                                .from(exportJobs)
                                .where(eq(exportJobs.id, exportId))
                                .get(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('read native export lease', cause),
                            ),
                        )
                    if (!row) return yield* new StoredExportNotFound({ exportId })
                    return row
                }),
            })
        }),
    )
}

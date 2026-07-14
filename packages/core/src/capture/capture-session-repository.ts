import { mkdir } from 'node:fs/promises'

import {
    CaptureEvent,
    CaptureFailure,
    CaptureRecord,
    CaptureRecordList,
    CaptureSource,
    CaptureStatSample,
    CaptureStatSampleList,
    CaptureStats,
    PacketSummary,
    type DurableCaptureState,
} from '@repo/shared/capture'
import { and, asc, count, desc, eq, inArray, ne, sql, type AnyColumn } from 'drizzle-orm'
import { Clock, Context, Data, Effect, Layer, Schema } from 'effect'

import {
    AppDataPaths,
    captureEvents,
    captureSegments,
    captureSessions,
    captureStatSamples,
    captureSummaries,
    Database,
    exportJobs,
    type DatabaseError,
} from '#core/storage'

export class CaptureRepositoryError extends Data.TaggedError('CaptureRepositoryError')<{
    readonly operation: string
    readonly message: string
    readonly cause?: unknown
}> {}

export class StoredCaptureNotFound extends Data.TaggedError('StoredCaptureNotFound')<{
    readonly captureId: string
}> {}

type RepositoryError = CaptureRepositoryError | StoredCaptureNotFound
type CaptureRow = typeof captureSessions.$inferSelect

export interface StoredSegment {
    readonly generation: number
    readonly path: string
    readonly committedBytes: string
    readonly committedPackets: string
    readonly firstPacketId: string
    readonly lastPacketId: string
    readonly evicted: boolean
}

const activeCaptureStates = ['preparing', 'capturing', 'stopping'] as const
const activeExportStates = ['queued', 'preparing', 'running', 'finalizing'] as const
const transitionTargets: Readonly<Record<DurableCaptureState, ReadonlySet<DurableCaptureState>>> = {
    preparing: new Set(['capturing', 'failed', 'interrupted']),
    capturing: new Set(['stopping', 'failed', 'interrupted']),
    stopping: new Set(['stopped', 'failed', 'interrupted']),
    stopped: new Set(['failed', 'deleting']),
    failed: new Set(['deleting']),
    interrupted: new Set(['recovering', 'deleting']),
    recovering: new Set(['stopped', 'failed']),
    deleting: new Set(['deleted']),
    deleted: new Set(),
}

function repositoryError(operation: string, cause: DatabaseError | unknown) {
    return new CaptureRepositoryError({
        operation,
        message: `Capture repository operation failed: ${operation}`,
        cause,
    })
}

function decimalGreaterThan(column: AnyColumn, value: string) {
    return sql`(length(${column}) > length(${value}) or (length(${column}) = length(${value}) and ${column} > ${value}))`
}

function interfaceNames(source: CaptureSource) {
    return source._tag === 'Live' ? source.interfaces.map((item) => item.name) : ['Replay']
}

function decodeSource(value: unknown) {
    return Schema.decodeUnknownSync(CaptureSource)(value)
}

function decodeRecord(row: CaptureRow, exportCount: number, retainedPortionOnly: boolean) {
    const source = decodeSource(row.sourceJson)
    return new CaptureRecord({
        captureId: row.id,
        state: row.state,
        source,
        interfaceNames: interfaceNames(source),
        sourceFormat: row.sourceFormat,
        registryRevision: row.registryRevision,
        startedAtNs: row.startedAtNs,
        stoppedAtNs: row.stoppedAtNs,
        packetCount: row.packetCount,
        retainedBytes: row.retainedBytes,
        retainedPortionOnly,
        failure:
            row.failureCode && row.failureMessage
                ? new CaptureFailure({
                      code: row.failureCode,
                      message: row.failureMessage,
                      recoverable: row.state === 'interrupted',
                  })
                : null,
        exportCount,
    })
}

export interface CaptureSessionRepositoryService {
    readonly create: (
        captureId: string,
        source: CaptureSource,
    ) => Effect.Effect<CaptureRecord, RepositoryError>
    readonly get: (captureId: string) => Effect.Effect<CaptureRecord, RepositoryError>
    readonly list: () => Effect.Effect<CaptureRecordList, CaptureRepositoryError>
    readonly active: () => Effect.Effect<CaptureRecord | null, CaptureRepositoryError>
    readonly transition: (
        captureId: string,
        state: DurableCaptureState,
        updates?: {
            readonly registryRevision?: string
            readonly packetCount?: string
            readonly retainedBytes?: string
            readonly stoppedAtNs?: string
            readonly failureCode?: string | null
            readonly failureMessage?: string | null
        },
    ) => Effect.Effect<CaptureRecord, RepositoryError>
    readonly persistStats: (
        captureId: string,
        stats: CaptureStats,
    ) => Effect.Effect<void, CaptureRepositoryError>
    readonly persistSummaries: (
        captureId: string,
        summaries: ReadonlyArray<PacketSummary>,
    ) => Effect.Effect<void, CaptureRepositoryError>
    readonly persistEvents: (
        captureId: string,
        events: ReadonlyArray<CaptureEvent>,
    ) => Effect.Effect<void, CaptureRepositoryError>
    readonly reconcileInterrupted: () => Effect.Effect<void, CaptureRepositoryError>
    readonly requestDelete: (captureId: string) => Effect.Effect<CaptureRecord, RepositoryError>
    readonly deletionReady: (captureId: string) => Effect.Effect<boolean, RepositoryError>
    readonly finalizeDelete: (captureId: string) => Effect.Effect<CaptureRecord, RepositoryError>
    readonly upsertSegments: (
        captureId: string,
        segments: ReadonlyArray<StoredSegment>,
    ) => Effect.Effect<void, CaptureRepositoryError>
    readonly readSummaries: (
        captureId: string,
        afterCursor: string | undefined,
        limit: number,
    ) => Effect.Effect<ReadonlyArray<PacketSummary>, CaptureRepositoryError>
    readonly latestStats: (
        captureId: string,
    ) => Effect.Effect<CaptureStats | undefined, CaptureRepositoryError>
    readonly readStatSamples: (
        captureId: string,
        limit: number,
    ) => Effect.Effect<CaptureStatSampleList, CaptureRepositoryError>
    readonly readEvents: (
        captureId: string,
        afterCursor: string | undefined,
        limit: number,
    ) => Effect.Effect<ReadonlyArray<CaptureEvent>, CaptureRepositoryError>
}

export class CaptureSessionRepository extends Context.Tag(
    '@repo/core/capture/CaptureSessionRepository',
)<CaptureSessionRepository, CaptureSessionRepositoryService>() {
    static readonly layer = Layer.effect(
        CaptureSessionRepository,
        Effect.gen(function* () {
            const database = yield* Database
            const paths = yield* AppDataPaths

            const enrich = Effect.fn('CaptureSessionRepository.enrich')(function* (
                row: CaptureRow,
            ) {
                const relatedExports = yield* database
                    .read('count capture exports', (db) =>
                        db
                            .select({ value: count() })
                            .from(exportJobs)
                            .where(eq(exportJobs.captureId, row.id))
                            .get(),
                    )
                    .pipe(
                        Effect.mapError((cause) => repositoryError('count capture exports', cause)),
                    )
                const evicted = yield* database
                    .read('find capture eviction', (db) =>
                        db
                            .select({ generation: captureSegments.generation })
                            .from(captureSegments)
                            .where(
                                and(
                                    eq(captureSegments.captureId, row.id),
                                    eq(captureSegments.evicted, true),
                                ),
                            )
                            .limit(1)
                            .get(),
                    )
                    .pipe(
                        Effect.mapError((cause) => repositoryError('find capture eviction', cause)),
                    )
                return yield* Effect.try({
                    try: () => decodeRecord(row, relatedExports?.value ?? 0, Boolean(evicted)),
                    catch: (cause) => repositoryError('decode capture', cause),
                })
            })

            const get = Effect.fn('CaptureSessionRepository.get')(function* (captureId: string) {
                const row = yield* database
                    .read('get capture', (db) =>
                        db
                            .select()
                            .from(captureSessions)
                            .where(eq(captureSessions.id, captureId))
                            .get(),
                    )
                    .pipe(Effect.mapError((cause) => repositoryError('get capture', cause)))
                if (!row) return yield* new StoredCaptureNotFound({ captureId })
                return yield* enrich(row).pipe(
                    Effect.mapError((cause) =>
                        cause instanceof CaptureRepositoryError
                            ? cause
                            : repositoryError('get capture', cause),
                    ),
                )
            })

            return CaptureSessionRepository.of({
                create: Effect.fn('CaptureSessionRepository.create')(function* (captureId, source) {
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* Effect.tryPromise({
                        try: () =>
                            Promise.all(
                                [
                                    paths.captureSegmentsRoot(captureId),
                                    paths.captureIndexesRoot(captureId),
                                    paths.captureRecoveryRoot(captureId),
                                ].map((path) => mkdir(path, { recursive: true, mode: 0o700 })),
                            ),
                        catch: (cause) => repositoryError('allocate capture directories', cause),
                    })
                    yield* database
                        .write('create capture', (db) =>
                            db
                                .insert(captureSessions)
                                .values({
                                    id: captureId,
                                    state: 'preparing',
                                    sourceJson: source,
                                    interfaceCount: interfaceNames(source).length,
                                    sourceFormat: 'pcapng',
                                    startedAtNs: now,
                                    createdAtNs: now,
                                    updatedAtNs: now,
                                })
                                .run(),
                        )
                        .pipe(Effect.mapError((cause) => repositoryError('create capture', cause)))
                    return yield* get(captureId)
                }),
                get,
                list: Effect.fn('CaptureSessionRepository.list')(function* () {
                    const rows = yield* database
                        .read('list captures', (db) =>
                            db
                                .select()
                                .from(captureSessions)
                                .where(ne(captureSessions.state, 'deleted'))
                                .orderBy(
                                    desc(sql`length(${captureSessions.startedAtNs})`),
                                    desc(captureSessions.startedAtNs),
                                )
                                .all(),
                        )
                        .pipe(Effect.mapError((cause) => repositoryError('list captures', cause)))
                    const captures = yield* Effect.forEach(rows, enrich)
                    return new CaptureRecordList({ captures })
                }),
                active: Effect.fn('CaptureSessionRepository.active')(function* () {
                    const row = yield* database
                        .read('get active capture', (db) =>
                            db
                                .select()
                                .from(captureSessions)
                                .where(inArray(captureSessions.state, activeCaptureStates))
                                .limit(1)
                                .get(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('get active capture', cause),
                            ),
                        )
                    return row ? yield* enrich(row) : null
                }),
                transition: Effect.fn('CaptureSessionRepository.transition')(function* (
                    captureId,
                    state,
                    updates = {},
                ) {
                    const current = yield* get(captureId)
                    if (!transitionTargets[current.state].has(state) && current.state !== state) {
                        return yield* repositoryError(
                            'transition capture',
                            new Error(`Invalid capture transition: ${current.state} -> ${state}`),
                        )
                    }
                    const now = (yield* Clock.currentTimeNanos).toString()
                    yield* database
                        .write('transition capture', (db) =>
                            db
                                .update(captureSessions)
                                .set({ state, ...updates, updatedAtNs: now })
                                .where(eq(captureSessions.id, captureId))
                                .run(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('transition capture', cause),
                            ),
                        )
                    return yield* get(captureId)
                }),
                persistStats: Effect.fn('CaptureSessionRepository.persistStats')(
                    function* (captureId, stats) {
                        const now = (yield* Clock.currentTimeNanos).toString()
                        yield* database
                            .write('persist capture stats', (db) =>
                                db.transaction((transaction) => {
                                    transaction
                                        .insert(captureStatSamples)
                                        .values({ captureId, sampledAtNs: now, statsJson: stats })
                                        .onConflictDoUpdate({
                                            target: [
                                                captureStatSamples.captureId,
                                                captureStatSamples.sampledAtNs,
                                            ],
                                            set: { statsJson: stats },
                                        })
                                        .run()
                                    transaction
                                        .update(captureSessions)
                                        .set({
                                            packetCount: stats.packetsPersisted,
                                            retainedBytes: stats.spoolBytesRetained,
                                            updatedAtNs: now,
                                        })
                                        .where(eq(captureSessions.id, captureId))
                                        .run()
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('persist capture stats', cause),
                                ),
                            )
                    },
                ),
                persistSummaries: Effect.fn('CaptureSessionRepository.persistSummaries')(
                    function* (captureId, summaries) {
                        if (summaries.length === 0) return
                        yield* database
                            .write('persist capture summaries', (db) =>
                                db.transaction((transaction) => {
                                    transaction
                                        .insert(captureSummaries)
                                        .values(
                                            summaries.map((summary) => ({
                                                captureId,
                                                cursor: summary.cursor,
                                                packetId: summary.key.packetId,
                                                summaryJson: summary,
                                            })),
                                        )
                                        .onConflictDoNothing()
                                        .run()
                                    transaction
                                        .update(captureSessions)
                                        .set({ summaryCursor: summaries.at(-1)!.cursor })
                                        .where(eq(captureSessions.id, captureId))
                                        .run()
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('persist capture summaries', cause),
                                ),
                            )
                    },
                ),
                persistEvents: Effect.fn('CaptureSessionRepository.persistEvents')(
                    function* (captureId, events) {
                        if (events.length === 0) return
                        yield* database
                            .write('persist capture events', (db) =>
                                db
                                    .insert(captureEvents)
                                    .values(
                                        events.map((event) => ({
                                            captureId,
                                            cursor: event.cursor,
                                            eventJson: event,
                                        })),
                                    )
                                    .onConflictDoNothing()
                                    .run(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('persist capture events', cause),
                                ),
                            )
                    },
                ),
                reconcileInterrupted: Effect.fn('CaptureSessionRepository.reconcileInterrupted')(
                    function* () {
                        const now = (yield* Clock.currentTimeNanos).toString()
                        yield* database
                            .write('mark interrupted operations', (db) =>
                                db.transaction((transaction) => {
                                    transaction
                                        .update(captureSessions)
                                        .set({
                                            state: 'interrupted',
                                            stoppedAtNs: now,
                                            failureCode: 'BackendInterrupted',
                                            failureMessage:
                                                'The backend stopped before capture finalization completed.',
                                            updatedAtNs: now,
                                        })
                                        .where(inArray(captureSessions.state, activeCaptureStates))
                                        .run()
                                    transaction
                                        .update(exportJobs)
                                        .set({
                                            state: 'interrupted',
                                            failureCode: 'BackendInterrupted',
                                            failureMessage:
                                                'The backend stopped before export finalization completed.',
                                            updatedAtNs: now,
                                        })
                                        .where(inArray(exportJobs.state, activeExportStates))
                                        .run()
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('mark interrupted operations', cause),
                                ),
                            )
                    },
                ),
                requestDelete: Effect.fn('CaptureSessionRepository.requestDelete')(
                    function* (captureId) {
                        const current = yield* get(captureId)
                        if (current.state === 'deleting' || current.state === 'deleted')
                            return current
                        if (
                            activeCaptureStates.includes(
                                current.state as (typeof activeCaptureStates)[number],
                            )
                        ) {
                            return yield* repositoryError(
                                'delete capture',
                                new Error('An active capture cannot be deleted.'),
                            )
                        }
                        if (!['stopped', 'failed', 'interrupted'].includes(current.state)) {
                            return yield* repositoryError(
                                'delete capture',
                                new Error(`Capture cannot be deleted from ${current.state}.`),
                            )
                        }
                        const now = (yield* Clock.currentTimeNanos).toString()
                        yield* database
                            .write('request capture deletion', (db) =>
                                db.transaction((transaction) => {
                                    transaction
                                        .update(captureSessions)
                                        .set({
                                            state: 'deleting',
                                            deleteRequested: true,
                                            updatedAtNs: now,
                                        })
                                        .where(eq(captureSessions.id, captureId))
                                        .run()
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('request capture deletion', cause),
                                ),
                            )
                        return yield* get(captureId)
                    },
                ),
                deletionReady: Effect.fn('CaptureSessionRepository.deletionReady')(
                    function* (captureId) {
                        yield* get(captureId)
                        return yield* database
                            .read('check capture deletion readiness', (db) => {
                                const leases = db
                                    .select({
                                        value: sql<number>`coalesce(sum(${captureSegments.leaseCount}), 0)`,
                                    })
                                    .from(captureSegments)
                                    .where(eq(captureSegments.captureId, captureId))
                                    .get()
                                const exports = db
                                    .select({ value: count() })
                                    .from(exportJobs)
                                    .where(
                                        and(
                                            eq(exportJobs.captureId, captureId),
                                            inArray(exportJobs.state, activeExportStates),
                                        ),
                                    )
                                    .get()
                                return (
                                    BigInt(leases?.value ?? 0) === 0n &&
                                    BigInt(exports?.value ?? 0) === 0n
                                )
                            })
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('check capture deletion readiness', cause),
                                ),
                            )
                    },
                ),
                finalizeDelete: Effect.fn('CaptureSessionRepository.finalizeDelete')(
                    function* (captureId) {
                        const current = yield* get(captureId)
                        if (current.state !== 'deleting') return current
                        const now = (yield* Clock.currentTimeNanos).toString()
                        yield* database
                            .write('finalize capture deletion', (db) =>
                                db
                                    .update(captureSessions)
                                    .set({ state: 'deleted', updatedAtNs: now })
                                    .where(
                                        and(
                                            eq(captureSessions.id, captureId),
                                            eq(captureSessions.state, 'deleting'),
                                        ),
                                    )
                                    .run(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('finalize capture deletion', cause),
                                ),
                            )
                        return yield* get(captureId)
                    },
                ),
                upsertSegments: Effect.fn('CaptureSessionRepository.upsertSegments')(
                    function* (captureId, segments) {
                        if (segments.length === 0) return
                        const now = (yield* Clock.currentTimeNanos).toString()
                        yield* database
                            .write('persist capture segments', (db) =>
                                db.transaction((transaction) => {
                                    for (const segment of segments) {
                                        transaction
                                            .insert(captureSegments)
                                            .values({
                                                captureId,
                                                generation: segment.generation,
                                                path: paths.resolveCaptureSegmentPath(
                                                    captureId,
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
                                                evicted: segment.evicted,
                                                createdAtNs: now,
                                            })
                                            .onConflictDoUpdate({
                                                target: [
                                                    captureSegments.captureId,
                                                    captureSegments.generation,
                                                ],
                                                set: {
                                                    path: paths.resolveCaptureSegmentPath(
                                                        captureId,
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
                                                    evicted: segment.evicted,
                                                },
                                            })
                                            .run()
                                    }
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('persist capture segments', cause),
                                ),
                            )
                    },
                ),
                readSummaries: Effect.fn('CaptureSessionRepository.readSummaries')(
                    function* (captureId, afterCursor, limit) {
                        const rows = yield* database
                            .read('read capture summaries', (db) =>
                                db
                                    .select({ value: captureSummaries.summaryJson })
                                    .from(captureSummaries)
                                    .where(
                                        and(
                                            eq(captureSummaries.captureId, captureId),
                                            decimalGreaterThan(
                                                captureSummaries.cursor,
                                                afterCursor ?? '0',
                                            ),
                                        ),
                                    )
                                    .orderBy(
                                        asc(sql`length(${captureSummaries.cursor})`),
                                        asc(captureSummaries.cursor),
                                    )
                                    .limit(limit)
                                    .all(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read capture summaries', cause),
                                ),
                            )
                        return yield* Effect.try({
                            try: () =>
                                rows.map((row) =>
                                    Schema.decodeUnknownSync(PacketSummary)(row.value),
                                ),
                            catch: (cause) => repositoryError('decode capture summaries', cause),
                        })
                    },
                ),
                latestStats: Effect.fn('CaptureSessionRepository.latestStats')(
                    function* (captureId) {
                        const row = yield* database
                            .read('read latest capture stats', (db) =>
                                db
                                    .select({ value: captureStatSamples.statsJson })
                                    .from(captureStatSamples)
                                    .where(eq(captureStatSamples.captureId, captureId))
                                    .orderBy(
                                        desc(sql`length(${captureStatSamples.sampledAtNs})`),
                                        desc(captureStatSamples.sampledAtNs),
                                    )
                                    .limit(1)
                                    .get(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read latest capture stats', cause),
                                ),
                            )
                        if (!row) return undefined
                        return yield* Effect.try({
                            try: () => Schema.decodeUnknownSync(CaptureStats)(row.value),
                            catch: (cause) => repositoryError('decode latest capture stats', cause),
                        })
                    },
                ),
                readStatSamples: Effect.fn('CaptureSessionRepository.readStatSamples')(
                    function* (captureId, limit) {
                        const rows = yield* database
                            .read('read capture stat samples', (db) =>
                                db
                                    .select({
                                        sampledAtNs: captureStatSamples.sampledAtNs,
                                        value: captureStatSamples.statsJson,
                                    })
                                    .from(captureStatSamples)
                                    .where(eq(captureStatSamples.captureId, captureId))
                                    .orderBy(
                                        desc(sql`length(${captureStatSamples.sampledAtNs})`),
                                        desc(captureStatSamples.sampledAtNs),
                                    )
                                    .limit(limit)
                                    .all(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read capture stat samples', cause),
                                ),
                            )
                        return yield* Effect.try({
                            try: () =>
                                new CaptureStatSampleList({
                                    samples: rows.reverse().map(
                                        (row) =>
                                            new CaptureStatSample({
                                                sampledAtNs: row.sampledAtNs,
                                                stats: Schema.decodeUnknownSync(CaptureStats)(
                                                    row.value,
                                                ),
                                            }),
                                    ),
                                }),
                            catch: (cause) => repositoryError('decode capture stat samples', cause),
                        })
                    },
                ),
                readEvents: Effect.fn('CaptureSessionRepository.readEvents')(
                    function* (captureId, afterCursor, limit) {
                        const rows = yield* database
                            .read('read capture events', (db) =>
                                db
                                    .select({ value: captureEvents.eventJson })
                                    .from(captureEvents)
                                    .where(
                                        and(
                                            eq(captureEvents.captureId, captureId),
                                            decimalGreaterThan(
                                                captureEvents.cursor,
                                                afterCursor ?? '0',
                                            ),
                                        ),
                                    )
                                    .orderBy(
                                        asc(sql`length(${captureEvents.cursor})`),
                                        asc(captureEvents.cursor),
                                    )
                                    .limit(limit)
                                    .all(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read capture events', cause),
                                ),
                            )
                        return yield* Effect.try({
                            try: () =>
                                rows.map((row) =>
                                    Schema.decodeUnknownSync(CaptureEvent)(row.value),
                                ),
                            catch: (cause) => repositoryError('decode capture events', cause),
                        })
                    },
                ),
            })
        }),
    )
}

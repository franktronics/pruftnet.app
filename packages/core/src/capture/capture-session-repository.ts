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
    PacketSummaryFilter,
    PacketSummaryManifest,
    type DurableCaptureState,
} from '@repo/shared/capture'
import {
    and,
    asc,
    desc,
    eq,
    gt,
    gte,
    inArray,
    ne,
    sql,
    type AnyColumn,
    type SQL,
} from 'drizzle-orm'
import { Clock, Context, Data, Effect, Layer, Schema } from 'effect'

import {
    AppDataPaths,
    captureEvents,
    captureSegments,
    captureSessions,
    captureStatSamples,
    captureSummaries,
    Database,
    exportArtifacts,
    type DatabaseError,
    type DrizzleDatabase,
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

function decimalAtLeast(expression: SQL, value: string) {
    return sql`(length(${expression}) > length(${value}) or (length(${expression}) = length(${value}) and ${expression} >= ${value}))`
}

function decimalAtMost(expression: SQL, value: string) {
    return sql`(length(${expression}) < length(${value}) or (length(${expression}) = length(${value}) and ${expression} <= ${value}))`
}

function normalizedFilterText(value: string) {
    return value.trim().toLowerCase()
}

function summaryColumnContains(key: string | undefined, value: string) {
    const keyPredicate = key ? sql`json_extract(summary_column.value, '$.key') = ${key} and` : sql``
    return sql`exists (
        select 1
        from json_each(${captureSummaries.summaryJson}, '$.columns') as summary_column
        where ${keyPredicate}
            instr(
                lower(cast(json_extract(summary_column.value, '$.value') as text)),
                ${normalizedFilterText(value)}
            ) > 0
    )`
}

function summaryFilterPredicates(
    filter: PacketSummaryFilter | null,
    originTimestampNs: string | null,
): ReadonlyArray<SQL> {
    if (!filter) return []
    const predicates: SQL[] = []
    const timestamp = sql`cast(json_extract(${captureSummaries.summaryJson}, '$.timestampNs') as text)`
    const search = normalizedFilterText(filter.search)
    const source = normalizedFilterText(filter.source)
    const destination = normalizedFilterText(filter.destination)
    if (search) predicates.push(summaryColumnContains(undefined, search))
    if (source) predicates.push(summaryColumnContains('source', source))
    if (destination) predicates.push(summaryColumnContains('destination', destination))
    if (originTimestampNs && filter.minRelativeTimestampNs !== null) {
        predicates.push(
            decimalAtLeast(
                timestamp,
                (BigInt(originTimestampNs) + BigInt(filter.minRelativeTimestampNs)).toString(),
            ),
        )
    }
    if (originTimestampNs && filter.maxRelativeTimestampNs !== null) {
        predicates.push(
            decimalAtMost(
                timestamp,
                (BigInt(originTimestampNs) + BigInt(filter.maxRelativeTimestampNs)).toString(),
            ),
        )
    }
    if (filter.protocolIds.length > 0) {
        predicates.push(sql`exists (
            select 1
            from json_each(${captureSummaries.summaryJson}, '$.protocolPath') as summary_protocol
            where cast(summary_protocol.value as integer) in (
                ${sql.join(
                    filter.protocolIds.map((protocolId) => sql`${protocolId}`),
                    sql`, `,
                )}
            )
        )`)
    }
    if (filter.interfaceIds.length > 0) {
        predicates.push(
            sql`cast(json_extract(${captureSummaries.summaryJson}, '$.interfaceId') as integer) in (
                ${sql.join(
                    filter.interfaceIds.map((interfaceId) => sql`${interfaceId}`),
                    sql`, `,
                )}
            )`,
        )
    }
    if (filter.minWireLength !== null) {
        predicates.push(
            sql`cast(json_extract(${captureSummaries.summaryJson}, '$.wireLength') as integer) >= ${filter.minWireLength}`,
        )
    }
    if (filter.maxWireLength !== null) {
        predicates.push(
            sql`cast(json_extract(${captureSummaries.summaryJson}, '$.wireLength') as integer) <= ${filter.maxWireLength}`,
        )
    }
    if (filter.parseConditions.length === 0) {
        predicates.push(sql`0`)
    } else if (filter.parseConditions.length < 4) {
        predicates.push(
            sql`cast(json_extract(${captureSummaries.summaryJson}, '$.parseCondition') as text) in (
                ${sql.join(
                    filter.parseConditions.map((condition) => sql`${condition}`),
                    sql`, `,
                )}
            )`,
        )
    }
    return predicates
}

function safeSummaryRowCount(value: string) {
    const count = BigInt(value)
    if (count > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RangeError('Packet summary row count exceeds the supported virtual table range.')
    return Number(count)
}

function summaryResultIndexKey(captureId: string, revision: string, filter: PacketSummaryFilter) {
    return `${captureId}:${revision}:${JSON.stringify(filter)}`
}

function summaryIndexQuery(
    db: DrizzleDatabase,
    captureId: string,
    revision: string,
    filter: PacketSummaryFilter,
    originTimestampNs: string | null,
) {
    return db
        .select({ rowIndex: captureSummaries.rowIndex })
        .from(captureSummaries)
        .where(
            and(
                eq(captureSummaries.captureId, captureId),
                decimalAtMost(sql`${captureSummaries.cursor}`, revision),
                ...summaryFilterPredicates(filter, originTimestampNs),
            ),
        )
        .orderBy(asc(captureSummaries.rowIndex))
        .toSQL()
}

function interfaceNames(source: CaptureSource) {
    return source._tag === 'Live' ? source.interfaces.map((item) => item.name) : ['Replay']
}

function decodeSource(value: unknown) {
    return Schema.decodeUnknownSync(CaptureSource)(value)
}

function decodeRecord(row: CaptureRow, retainedPortionOnly: boolean) {
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
    })
}

export interface ExportSnapshot {
    readonly segments: ReadonlyArray<{
        readonly generation: number
        readonly path: string
        readonly committedBytes: string
        readonly committedPackets: string
    }>
    readonly retainedPortionOnly: boolean
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
    ) => Effect.Effect<CaptureStatSample, CaptureRepositoryError>
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
    readonly acquireExportSnapshot: (
        captureId: string,
        generations?: ReadonlyArray<number>,
    ) => Effect.Effect<ExportSnapshot, RepositoryError>
    readonly releaseExportSnapshot: (
        captureId: string,
        generations: ReadonlyArray<number>,
    ) => Effect.Effect<void, CaptureRepositoryError>
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
    readonly summaryManifest: (
        captureId: string,
        filter: PacketSummaryFilter | null,
    ) => Effect.Effect<PacketSummaryManifest, RepositoryError>
    readonly readSummaryRange: (
        captureId: string,
        revision: string,
        filter: PacketSummaryFilter | null,
        startIndex: number,
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
            const readFilteredIndex = Effect.fn('CaptureSessionRepository.readFilteredIndex')(
                function* (
                    captureId: string,
                    revision: string,
                    filter: PacketSummaryFilter,
                    originTimestampNs: string | null,
                    startIndex: number,
                    limit: number,
                    preview = false,
                ) {
                    const query = yield* database.read('prepare packet filter', (db) =>
                        summaryIndexQuery(db, captureId, revision, filter, originTimestampNs),
                    )
                    return yield* database.summaryIndex({
                        key: summaryResultIndexKey(captureId, revision, filter),
                        sql: query.sql,
                        params: query.params as import('node:sqlite').SQLInputValue[],
                        startIndex,
                        limit,
                        preview,
                    })
                },
            )

            const readSummaryRows = Effect.fn('CaptureSessionRepository.readSummaryRows')(
                function* (
                    captureId: string,
                    startIndex: number,
                    limit: number,
                    rowIndexes?: number[],
                ) {
                    if (rowIndexes?.length === 0) return []
                    const rows = yield* database
                        .read('read packet summary range', (db) =>
                            db
                                .select({ value: captureSummaries.summaryJson })
                                .from(captureSummaries)
                                .where(
                                    and(
                                        eq(captureSummaries.captureId, captureId),
                                        rowIndexes
                                            ? inArray(captureSummaries.rowIndex, rowIndexes)
                                            : gte(captureSummaries.rowIndex, startIndex),
                                    ),
                                )
                                .orderBy(asc(captureSummaries.rowIndex))
                                .limit(limit)
                                .all(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('read packet summary range', cause),
                            ),
                        )
                    return yield* Effect.try({
                        try: () =>
                            rows.map((row) => Schema.decodeUnknownSync(PacketSummary)(row.value)),
                        catch: (cause) => repositoryError('decode packet summary range', cause),
                    })
                },
            )

            const enrich = Effect.fn('CaptureSessionRepository.enrich')(function* (
                row: CaptureRow,
            ) {
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
                    try: () => decodeRecord(row, Boolean(evicted)),
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
                        return new CaptureStatSample({ sampledAtNs: now, stats })
                    },
                ),
                persistSummaries: Effect.fn('CaptureSessionRepository.persistSummaries')(
                    function* (captureId, summaries) {
                        if (summaries.length === 0) return
                        yield* database
                            .write('persist capture summaries', (db) =>
                                db.transaction((transaction) => {
                                    const stored = transaction
                                        .select({
                                            cursor: captureSessions.summaryCursor,
                                            count: captureSessions.summaryCount,
                                        })
                                        .from(captureSessions)
                                        .where(eq(captureSessions.id, captureId))
                                        .get()
                                    if (!stored)
                                        throw new Error(
                                            `Capture ${captureId} disappeared while persisting summaries.`,
                                        )
                                    const storedCursor = BigInt(stored.cursor)
                                    const fresh = summaries
                                        .filter((summary) => BigInt(summary.cursor) > storedCursor)
                                        .sort((left, right) => {
                                            const leftCursor = BigInt(left.cursor)
                                            const rightCursor = BigInt(right.cursor)
                                            return leftCursor < rightCursor
                                                ? -1
                                                : leftCursor > rightCursor
                                                  ? 1
                                                  : 0
                                        })
                                        .filter(
                                            (summary, index, ordered) =>
                                                index === 0 ||
                                                summary.cursor !== ordered[index - 1]!.cursor,
                                        )
                                    if (fresh.length === 0) return
                                    const firstRowIndex = safeSummaryRowCount(stored.count)
                                    if (firstRowIndex + fresh.length > Number.MAX_SAFE_INTEGER)
                                        throw new RangeError(
                                            'Packet summary row index exceeds the supported virtual table range.',
                                        )
                                    transaction
                                        .insert(captureSummaries)
                                        .values(
                                            fresh.map((summary, offset) => ({
                                                captureId,
                                                cursor: summary.cursor,
                                                rowIndex: firstRowIndex + offset,
                                                packetId: summary.key.packetId,
                                                summaryJson: summary,
                                            })),
                                        )
                                        .run()
                                    transaction
                                        .update(captureSessions)
                                        .set({
                                            summaryCursor: fresh.at(-1)!.cursor,
                                            summaryCount: String(firstRowIndex + fresh.length),
                                        })
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
                                        .update(captureSegments)
                                        .set({ leaseCount: 0 })
                                        .where(sql`${captureSegments.leaseCount} > 0`)
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
                                return BigInt(leases?.value ?? 0) === 0n
                            })
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('check capture deletion readiness', cause),
                                ),
                            )
                    },
                ),
                acquireExportSnapshot: Effect.fn('CaptureSessionRepository.acquireExportSnapshot')(
                    function* (captureId, generations) {
                        yield* get(captureId)
                        return yield* database
                            .write('acquire export segment snapshot', (db) =>
                                db.transaction((transaction) => {
                                    const capture = transaction
                                        .select({ state: captureSessions.state })
                                        .from(captureSessions)
                                        .where(eq(captureSessions.id, captureId))
                                        .get()
                                    if (
                                        !capture ||
                                        capture.state === 'deleting' ||
                                        capture.state === 'deleted'
                                    ) {
                                        throw new Error('The capture is being deleted.')
                                    }
                                    const baseCondition = and(
                                        eq(captureSegments.captureId, captureId),
                                        eq(captureSegments.valid, true),
                                        eq(captureSegments.evicted, false),
                                    )
                                    const segments = transaction
                                        .select({
                                            generation: captureSegments.generation,
                                            path: captureSegments.path,
                                            committedBytes: captureSegments.committedBytes,
                                            committedPackets: captureSegments.committedPackets,
                                        })
                                        .from(captureSegments)
                                        .where(
                                            generations && generations.length > 0
                                                ? and(
                                                      baseCondition,
                                                      inArray(
                                                          captureSegments.generation,
                                                          generations,
                                                      ),
                                                  )
                                                : baseCondition,
                                        )
                                        .orderBy(asc(captureSegments.generation))
                                        .all()
                                    if (segments.length === 0) {
                                        throw new Error(
                                            'The capture has no committed source segments.',
                                        )
                                    }
                                    const evicted = transaction
                                        .select({ generation: captureSegments.generation })
                                        .from(captureSegments)
                                        .where(
                                            and(
                                                eq(captureSegments.captureId, captureId),
                                                eq(captureSegments.evicted, true),
                                            ),
                                        )
                                        .limit(1)
                                        .get()
                                    for (const segment of segments) {
                                        transaction
                                            .update(captureSegments)
                                            .set({
                                                leaseCount: sql`${captureSegments.leaseCount} + 1`,
                                            })
                                            .where(
                                                and(
                                                    eq(captureSegments.captureId, captureId),
                                                    eq(
                                                        captureSegments.generation,
                                                        segment.generation,
                                                    ),
                                                ),
                                            )
                                            .run()
                                    }
                                    return { segments, retainedPortionOnly: Boolean(evicted) }
                                }),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('acquire export segment snapshot', cause),
                                ),
                            )
                    },
                ),
                releaseExportSnapshot: Effect.fn('CaptureSessionRepository.releaseExportSnapshot')(
                    function* (captureId, generations) {
                        if (generations.length === 0) return
                        yield* database
                            .write('release export segment snapshot', (db) =>
                                db
                                    .update(captureSegments)
                                    .set({
                                        leaseCount: sql`max(${captureSegments.leaseCount} - 1, 0)`,
                                    })
                                    .where(
                                        and(
                                            eq(captureSegments.captureId, captureId),
                                            inArray(captureSegments.generation, generations),
                                        ),
                                    )
                                    .run(),
                            )
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('release export segment snapshot', cause),
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
                                db.transaction((transaction) => {
                                    transaction
                                        .delete(exportArtifacts)
                                        .where(eq(exportArtifacts.captureId, captureId))
                                        .run()
                                    transaction
                                        .update(captureSessions)
                                        .set({ state: 'deleted', updatedAtNs: now })
                                        .where(
                                            and(
                                                eq(captureSessions.id, captureId),
                                                eq(captureSessions.state, 'deleting'),
                                            ),
                                        )
                                        .run()
                                }),
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
                            .read('read capture summaries', (db) => {
                                const cursor = afterCursor ?? '0'
                                const previous = db
                                    .select({ rowIndex: captureSummaries.rowIndex })
                                    .from(captureSummaries)
                                    .where(
                                        and(
                                            eq(captureSummaries.captureId, captureId),
                                            eq(captureSummaries.cursor, cursor),
                                        ),
                                    )
                                    .get()
                                if (previous || cursor === '0') {
                                    return db
                                        .select({ value: captureSummaries.summaryJson })
                                        .from(captureSummaries)
                                        .where(
                                            and(
                                                eq(captureSummaries.captureId, captureId),
                                                gt(
                                                    captureSummaries.rowIndex,
                                                    previous?.rowIndex ?? -1,
                                                ),
                                            ),
                                        )
                                        .orderBy(asc(captureSummaries.rowIndex))
                                        .limit(limit)
                                        .all()
                                }
                                return db
                                    .select({ value: captureSummaries.summaryJson })
                                    .from(captureSummaries)
                                    .where(
                                        and(
                                            eq(captureSummaries.captureId, captureId),
                                            decimalGreaterThan(captureSummaries.cursor, cursor),
                                        ),
                                    )
                                    .orderBy(
                                        asc(sql`length(${captureSummaries.cursor})`),
                                        asc(captureSummaries.cursor),
                                    )
                                    .limit(limit)
                                    .all()
                            })
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
                summaryManifest: Effect.fn('CaptureSessionRepository.summaryManifest')(
                    function* (captureId, filter) {
                        const stored = yield* database
                            .read('read packet summary manifest', (db) => {
                                const session = db
                                    .select({
                                        state: captureSessions.state,
                                        revision: captureSessions.summaryCursor,
                                        totalRowCount: captureSessions.summaryCount,
                                    })
                                    .from(captureSessions)
                                    .where(eq(captureSessions.id, captureId))
                                    .get()
                                if (!session) return undefined
                                const first = db
                                    .select({ value: captureSummaries.summaryJson })
                                    .from(captureSummaries)
                                    .where(eq(captureSummaries.captureId, captureId))
                                    .orderBy(asc(captureSummaries.rowIndex))
                                    .limit(1)
                                    .get()
                                const last = db
                                    .select({ value: captureSummaries.summaryJson })
                                    .from(captureSummaries)
                                    .where(eq(captureSummaries.captureId, captureId))
                                    .orderBy(desc(captureSummaries.rowIndex))
                                    .limit(1)
                                    .get()
                                const origin = first
                                    ? Schema.decodeUnknownSync(PacketSummary)(first.value)
                                    : undefined
                                const tail = last
                                    ? Schema.decodeUnknownSync(PacketSummary)(last.value)
                                    : undefined
                                const totalRowCount = safeSummaryRowCount(session.totalRowCount)
                                return new PacketSummaryManifest({
                                    captureId,
                                    revision: session.revision,
                                    rowCount: totalRowCount,
                                    totalRowCount,
                                    originTimestampNs: origin?.timestampNs ?? null,
                                    lastTimestampNs: tail?.timestampNs ?? null,
                                    hasGaps:
                                        totalRowCount > 0 &&
                                        BigInt(session.revision) !== BigInt(totalRowCount),
                                    captureComplete: !activeCaptureStates.includes(
                                        session.state as (typeof activeCaptureStates)[number],
                                    ),
                                })
                            })
                            .pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read packet summary manifest', cause),
                                ),
                            )
                        if (!stored) return yield* new StoredCaptureNotFound({ captureId })
                        if (!filter) return stored
                        const index = yield* readFilteredIndex(
                            captureId,
                            stored.revision,
                            filter,
                            stored.originTimestampNs,
                            0,
                            256,
                            true,
                        ).pipe(
                            Effect.mapError((cause) =>
                                repositoryError('index packet summary filter', cause),
                            ),
                        )
                        const initialSummaries = yield* readSummaryRows(
                            captureId,
                            0,
                            256,
                            index.indexes,
                        )
                        return new PacketSummaryManifest({
                            ...stored,
                            rowCount: index.count,
                            initialSummaries,
                            indexing: index.indexing,
                        })
                    },
                ),
                readSummaryRange: Effect.fn('CaptureSessionRepository.readSummaryRange')(
                    function* (captureId, revision, filter, startIndex, limit) {
                        let rowIndexes: number[] | undefined
                        if (filter) {
                            const origin = yield* database
                                .read('read summary origin', (db) =>
                                    db
                                        .select({ value: captureSummaries.summaryJson })
                                        .from(captureSummaries)
                                        .where(eq(captureSummaries.captureId, captureId))
                                        .orderBy(asc(captureSummaries.rowIndex))
                                        .limit(1)
                                        .get(),
                                )
                                .pipe(
                                    Effect.mapError((cause) =>
                                        repositoryError('read summary origin', cause),
                                    ),
                                )
                            const index = yield* readFilteredIndex(
                                captureId,
                                revision,
                                filter,
                                origin
                                    ? Schema.decodeUnknownSync(PacketSummary)(origin.value)
                                          .timestampNs
                                    : null,
                                startIndex,
                                limit,
                            ).pipe(
                                Effect.mapError((cause) =>
                                    repositoryError('read filtered summary index', cause),
                                ),
                            )
                            rowIndexes = index.indexes
                            if (rowIndexes.length === 0) return []
                        }
                        return yield* readSummaryRows(captureId, startIndex, limit, rowIndexes)
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

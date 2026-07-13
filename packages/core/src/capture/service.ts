import {
    CaptureEventBatch,
    CaptureInterface,
    CaptureInterfaceCapabilities,
    CaptureSession,
    CaptureStats,
    PacketKey,
    PacketSummary,
    PacketSummaryBatch,
    PacketSummaryColumn,
    LiveCaptureFailed,
    LiveCaptureSource,
    ReplayCaptureSource,
    RegistrySnapshot,
    CaptureRpcError,
    CaptureAlreadyRunning,
    CaptureNotFound,
    CaptureOptionsInvalid,
    CaptureWorkerCrashed,
    CaptureWorkerUnavailable,
    PacketEvicted,
    PacketDetailPending,
    PacketDataCorrupted,
    PacketNotFound,
    RegistryUnavailable,
    ReplayFailed,
} from '@repo/shared/capture'
import { readFile, unlink } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'
import { Context, Effect, Either, Layer, Schema } from 'effect'

import { CaptureWorker, CaptureWorkerError } from './replay-worker'

const Decimal = Schema.String.pipe(Schema.pattern(/^(0|[1-9][0-9]*)$/))
const SessionResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Boolean,
    captureHigh: Decimal,
    captureLow: Decimal,
    state: Schema.Literal('starting', 'running', 'stopping', 'stopped', 'completed', 'failed'),
    registryRevision: Decimal,
    startedAtNs: Decimal,
    stoppedAtNs: Schema.NullOr(Decimal),
    failure: Schema.NullOr(Schema.String),
})
const HelloResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    protocolVersion: Schema.Literal(2),
    features: Schema.Array(Schema.String),
})
const InterfacesResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    interfaces: Schema.Array(CaptureInterface),
})
const CapabilitiesResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    name: Schema.NonEmptyString,
    canSetMonitorMode: Schema.Boolean,
    linkTypes: CaptureInterfaceCapabilities.fields.linkTypes,
    timestampTypes: CaptureInterfaceCapabilities.fields.timestampTypes,
    warnings: Schema.Array(Schema.String),
})
const RawSummary = Schema.Struct({
    cursor: Decimal,
    captureHigh: Decimal,
    captureLow: Decimal,
    packetId: Decimal,
    timestampNs: Decimal,
    interfaceId: Schema.NonNegativeInt,
    capturedLength: Schema.NonNegativeInt,
    wireLength: Schema.NonNegativeInt,
    linkType: Schema.NonNegativeInt,
    captureFlags: Schema.NonNegativeInt,
    parseCondition: Schema.Literal('complete', 'partial', 'malformed', 'resourceLimit'),
    protocolPath: Schema.Array(Schema.Number.pipe(Schema.int(), Schema.positive())),
    columns: Schema.Array(PacketSummaryColumn),
    analysisRevision: Decimal,
})
const SummariesResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    captureHigh: Decimal,
    captureLow: Decimal,
    firstCursor: Schema.NullOr(Decimal),
    lastCursor: Schema.NullOr(Decimal),
    oldestAvailableCursor: Schema.NullOr(Decimal),
    newestAvailableCursor: Schema.NullOr(Decimal),
    gapBeforeFirst: Schema.Boolean,
    captureComplete: Schema.Boolean,
    summaries: Schema.Array(RawSummary),
})
const RegistryResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    registryRevision: Decimal,
    protocols: RegistrySnapshot.fields.protocols,
    fields: RegistrySnapshot.fields.fields,
})
const { captureId: _captureStatsId, ...CaptureStatsResponseFields } = CaptureStats.fields
void _captureStatsId
const StatsResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    captureHigh: Decimal,
    captureLow: Decimal,
    ...CaptureStatsResponseFields,
})
const EventsResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    captureHigh: Decimal,
    captureLow: Decimal,
    gapBeforeFirst: Schema.Boolean,
    events: CaptureEventBatch.fields.events,
})
const DetailResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(true),
    captureHigh: Decimal,
    captureLow: Decimal,
    format: Schema.Literal('PRT2'),
    dataPath: Schema.NonEmptyString,
    byteLength: Decimal,
    registryRevision: Decimal,
    analysisRevision: Decimal,
})
const FailureResponse = Schema.Struct({
    v: Schema.Literal(2),
    id: Schema.String,
    ok: Schema.Literal(false),
    error: Schema.String,
    message: Schema.optional(Schema.String),
    captureHigh: Schema.optional(Decimal),
    captureLow: Schema.optional(Decimal),
})

const captureId = (high: string, low: string) =>
    BigInt(high).toString(16).padStart(16, '0') + BigInt(low).toString(16).padStart(16, '0')

type CaptureError = Schema.Schema.Type<typeof CaptureRpcError>

const rpcError = (error: CaptureWorkerError): CaptureError =>
    error.reason === 'spawn' ||
    error.reason === 'write' ||
    error.reason === 'timeout' ||
    error.reason === 'capacity'
        ? new CaptureWorkerUnavailable({
              title: 'Capture worker unavailable',
              message: error.message,
              retryable: true,
          })
        : new CaptureWorkerCrashed({
              title: 'Capture worker failed',
              message: error.message,
              retryable: true,
          })

export interface CaptureService {
    readonly listInterfaces: () => Effect.Effect<ReadonlyArray<CaptureInterface>, CaptureError>
    readonly capabilities: (
        name: string,
        monitorMode: boolean,
    ) => Effect.Effect<CaptureInterfaceCapabilities, CaptureError>
    readonly startLive: (source: LiveCaptureSource) => Effect.Effect<CaptureSession, CaptureError>
    readonly startReplay: (fileId: string) => Effect.Effect<CaptureSession, CaptureError>
    readonly stop: (capture: string) => Effect.Effect<CaptureSession, CaptureError>
    readonly session: (capture: string) => Effect.Effect<CaptureSession, CaptureError>
    readonly summaries: (
        capture: string,
        cursor: string | undefined,
        limit: number,
    ) => Effect.Effect<PacketSummaryBatch, CaptureError>
    readonly registry: (revision: string) => Effect.Effect<RegistrySnapshot, CaptureError>
    readonly stats: (capture: string) => Effect.Effect<CaptureStats, CaptureError>
    readonly events: (
        capture: string,
        cursor: string | undefined,
        limit: number,
    ) => Effect.Effect<CaptureEventBatch, CaptureError>
    readonly detail: (
        capture: string,
        packetId: string,
        registryRevision?: string,
        analysisRevision?: string,
    ) => Effect.Effect<Uint8Array, CaptureError>
}

export class Capture extends Context.Tag('@repo/core/capture/Capture')<Capture, CaptureService>() {
    static readonly layer = Layer.effect(
        Capture,
        Effect.gen(function* () {
            const worker = yield* CaptureWorker
            const lifecycle = yield* Effect.makeSemaphore(1)
            const decode = <A, I, R>(schema: Schema.Schema<A, I, R>, value: unknown) =>
                Schema.decodeUnknown(schema)(value).pipe(
                    Effect.mapError(
                        (cause) =>
                            new CaptureWorkerCrashed({
                                title: 'Invalid capture worker response',
                                message: String(cause),
                            }),
                    ),
                )
            const workerFailure = (
                error: Schema.Schema.Type<typeof FailureResponse>,
                live = false,
            ): CaptureError => {
                switch (error.error) {
                    case 'unknown_path_token':
                        return new CaptureOptionsInvalid({
                            title: 'Replay file is not allowlisted',
                        })
                    case 'stale_capture':
                        return new CaptureNotFound({
                            title: 'Capture is stale or has been replaced',
                        })
                    case 'not_started':
                        return new RegistryUnavailable({
                            title: 'Registry is unavailable before capture starts',
                        })
                    case 'evicted':
                        return new PacketEvicted({ title: 'Packet was evicted' })
                    case 'detail_pending':
                        return new PacketDetailPending({
                            title: 'Packet detail is not analyzed yet',
                        })
                    case 'corrupt_packet':
                        return new PacketDataCorrupted({
                            title: 'Persisted packet data is corrupted',
                        })
                    case 'analysis_failed':
                        return new PacketDataCorrupted({
                            title: 'Packet analysis failed',
                        })
                    case 'revision_mismatch':
                        return new RegistryUnavailable({
                            title: 'Packet detail revision is no longer available',
                        })
                    case 'detail_capacity':
                        return new CaptureWorkerUnavailable({
                            title: 'Packet detail capacity is exhausted',
                            retryable: true,
                        })
                    case 'not_found':
                        return new PacketNotFound({ title: 'Packet not found' })
                    case 'InvalidOptions':
                    case 'MemoryBudgetExceeded':
                        return new CaptureOptionsInvalid({
                            title: 'Invalid live capture options',
                            message: error.message,
                        })
                    case 'PermissionDenied':
                        return new LiveCaptureFailed({
                            title: 'Capture permission denied',
                            message: error.message,
                            whatToDo:
                                'Grant packet-capture permission to the capture worker, then try again.',
                            retryable: true,
                        })
                    case 'DeviceNotFound':
                        return new LiveCaptureFailed({
                            title: 'Capture interface is unavailable',
                            message: error.message,
                            whatToDo:
                                'Refresh the interface list and select an available interface.',
                            retryable: true,
                        })
                    default:
                        if (live)
                            return new LiveCaptureFailed({
                                title: 'Live capture could not start',
                                message: error.message ?? error.error,
                                retryable: true,
                            })
                        return new ReplayFailed({
                            title: 'Replay operation failed',
                            message: error.error,
                        })
                }
            }
            const call = Effect.fn('Capture.call')(function* <A, I, R>(
                schema: Schema.Schema<A, I, R>,
                command: Readonly<Record<string, unknown>>,
            ) {
                const value = yield* worker.request(command).pipe(Effect.mapError(rpcError))
                const failure = Schema.decodeUnknownEither(FailureResponse)(value)
                if (Either.isRight(failure))
                    return yield* workerFailure(failure.right, command.op === 'startLive')
                return yield* decode(schema, value)
            })
            const toSession = (
                raw: Schema.Schema.Type<typeof SessionResponse>,
                source: CaptureSession['source'],
            ) =>
                new CaptureSession({
                    captureId: captureId(raw.captureHigh, raw.captureLow),
                    state: raw.state,
                    source,
                    registryRevision: raw.registryRevision,
                    startedAtNs: raw.startedAtNs,
                    stoppedAtNs: raw.stoppedAtNs,
                    failure: raw.failure,
                })
            let source: CaptureSession['source'] = new ReplayCaptureSource({ fileId: 'unknown' })
            let activeSession: CaptureSession | undefined
            const sessionCall = Effect.fn('Capture.sessionCall')(function* (
                op: 'start' | 'startLive' | 'stop' | 'status',
                sessionSource: CaptureSession['source'],
                extra: Readonly<Record<string, unknown>> = {},
            ) {
                const session = toSession(
                    yield* call(SessionResponse, { op, ...extra }),
                    sessionSource,
                )
                activeSession = session
                source = sessionSource
                return session
            })
            const requireCapture = Effect.fn('Capture.requireCapture')(function* (
                captureId: string,
            ) {
                if (!activeSession || activeSession.captureId !== captureId) {
                    return yield* new CaptureNotFound({ title: 'Capture not found' })
                }
                return activeSession
            })
            const captureHalves = (value: string) => ({
                captureHigh: BigInt(`0x${value.slice(0, 16)}`).toString(),
                captureLow: BigInt(`0x${value.slice(16)}`).toString(),
            })
            const requireResponseCapture = Effect.fn('Capture.requireResponseCapture')(function* (
                expected: string,
                raw: { readonly captureHigh: string; readonly captureLow: string },
            ) {
                if (captureId(raw.captureHigh, raw.captureLow) !== expected) {
                    return yield* new CaptureNotFound({
                        title: 'Capture worker returned stale capture data',
                    })
                }
            })
            const locked = <A, E>(effect: Effect.Effect<A, E>) => lifecycle.withPermits(1)(effect)

            const hello = yield* call(HelloResponse, { op: 'hello' })
            if (!hello.features.includes('live')) {
                return yield* new CaptureWorkerUnavailable({
                    title: 'Capture worker does not support live capture',
                })
            }

            return Capture.of({
                listInterfaces: Effect.fn('Capture.listInterfaces')(function* () {
                    return (yield* call(InterfacesResponse, { op: 'interfaces' })).interfaces
                }),
                capabilities: Effect.fn('Capture.capabilities')(function* (name, monitorMode) {
                    const raw = yield* call(CapabilitiesResponse, {
                        op: 'capabilities',
                        name,
                        monitorMode,
                    })
                    return new CaptureInterfaceCapabilities(raw)
                }),
                startReplay: Effect.fn('Capture.startReplay')(function* (fileId) {
                    return yield* locked(
                        Effect.gen(function* () {
                            if (
                                activeSession &&
                                (activeSession.state === 'starting' ||
                                    activeSession.state === 'running')
                            ) {
                                return yield* new CaptureAlreadyRunning({
                                    title: 'A capture is already running',
                                    activeCaptureId: activeSession.captureId,
                                })
                            }
                            const nextSource = new ReplayCaptureSource({ fileId })
                            return yield* sessionCall('start', nextSource, { token: fileId })
                        }),
                    )
                }),
                startLive: Effect.fn('Capture.startLive')(function* (nextSource) {
                    return yield* locked(
                        Effect.gen(function* () {
                            if (
                                activeSession &&
                                (activeSession.state === 'starting' ||
                                    activeSession.state === 'running')
                            ) {
                                return yield* new CaptureAlreadyRunning({
                                    title: 'A capture is already running',
                                    activeCaptureId: activeSession.captureId,
                                })
                            }
                            const interfaces = Object.fromEntries(
                                nextSource.interfaces.flatMap((item, index) => [
                                    [`interface${index}Name`, item.name],
                                    [`interface${index}Promiscuous`, item.promiscuous],
                                    [`interface${index}MonitorMode`, item.monitorMode],
                                    [
                                        `interface${index}LinkType`,
                                        item.linkType === null ? 0 : item.linkType + 1,
                                    ],
                                    [`interface${index}TimestampType`, item.timestampType ?? ''],
                                ]),
                            )
                            return yield* sessionCall('startLive', nextSource, {
                                interfaceCount: nextSource.interfaces.length,
                                bpfFilter: nextSource.bpfFilter,
                                snaplen: nextSource.snaplen,
                                pcapBufferSizeBytes: nextSource.pcapBufferSizeBytes,
                                readTimeoutMs: nextSource.readTimeoutMs,
                                dispatchBatchSize: nextSource.dispatchBatchSize,
                                ringSlots: nextSource.ringSlots,
                                ringBytes: nextSource.captureQueueBytes,
                                maxTotalRingBytes: nextSource.maxTotalRingBytes,
                                spoolMaxTotalBytes: nextSource.spoolMaxTotalBytes,
                                spoolSegmentBytes: nextSource.spoolSegmentBytes,
                                spoolMaxSegments: nextSource.spoolMaxSegments,
                                spoolRingMode: nextSource.spoolRingMode,
                                spoolTemporary: nextSource.spoolTemporary,
                                ...interfaces,
                            })
                        }),
                    )
                }),
                stop: Effect.fn('Capture.stop')(function* (capture) {
                    return yield* locked(
                        Effect.gen(function* () {
                            yield* requireCapture(capture)
                            const raw = yield* call(SessionResponse, {
                                op: 'stop',
                                ...captureHalves(capture),
                            })
                            yield* requireResponseCapture(capture, raw)
                            const session = toSession(raw, source)
                            activeSession = session
                            return session
                        }),
                    )
                }),
                session: Effect.fn('Capture.session')(function* (capture) {
                    return yield* locked(
                        Effect.gen(function* () {
                            yield* requireCapture(capture)
                            const raw = yield* call(SessionResponse, {
                                op: 'status',
                                ...captureHalves(capture),
                            })
                            yield* requireResponseCapture(capture, raw)
                            const session = toSession(raw, source)
                            activeSession = session
                            return session
                        }),
                    )
                }),
                summaries: Effect.fn('Capture.summaries')(function* (capture, cursor, limit) {
                    yield* requireCapture(capture)
                    const raw = yield* call(SummariesResponse, {
                        op: 'summaries',
                        ...captureHalves(capture),
                        cursor: cursor ?? '0',
                        limit,
                    })
                    yield* requireResponseCapture(capture, raw)
                    for (const item of raw.summaries) yield* requireResponseCapture(capture, item)
                    return new PacketSummaryBatch({
                        ...raw,
                        captureId: capture,
                        summaries: raw.summaries.map(
                            (item) =>
                                new PacketSummary({
                                    cursor: item.cursor,
                                    key: new PacketKey({
                                        captureId: captureId(item.captureHigh, item.captureLow),
                                        packetId: item.packetId,
                                    }),
                                    timestampNs: item.timestampNs,
                                    interfaceId: item.interfaceId,
                                    capturedLength: item.capturedLength,
                                    wireLength: item.wireLength,
                                    linkType: item.linkType,
                                    captureFlags: item.captureFlags,
                                    parseCondition: item.parseCondition,
                                    protocolPath: item.protocolPath,
                                    columns: item.columns,
                                    analysisRevision: item.analysisRevision,
                                }),
                        ),
                    })
                }),
                registry: Effect.fn('Capture.registry')(function* (revision) {
                    const raw = yield* call(RegistryResponse, { op: 'registry' })
                    if (raw.registryRevision !== revision) {
                        return yield* new RegistryUnavailable({
                            title: 'Registry revision is unavailable',
                        })
                    }
                    return new RegistrySnapshot(raw)
                }),
                stats: Effect.fn('Capture.stats')(function* (capture) {
                    yield* requireCapture(capture)
                    const raw = yield* call(StatsResponse, {
                        op: 'stats',
                        ...captureHalves(capture),
                    })
                    const responseCaptureId = captureId(raw.captureHigh, raw.captureLow)
                    if (responseCaptureId !== capture)
                        return yield* new CaptureNotFound({ title: 'Capture not found' })
                    return new CaptureStats({ ...raw, captureId: responseCaptureId })
                }),
                events: Effect.fn('Capture.events')(function* (capture, cursor, limit) {
                    yield* requireCapture(capture)
                    const raw = yield* call(EventsResponse, {
                        op: 'events',
                        ...captureHalves(capture),
                        cursor: cursor ?? '0',
                        limit,
                    })
                    yield* requireResponseCapture(capture, raw)
                    return new CaptureEventBatch({
                        captureId: capture,
                        gapBeforeFirst: raw.gapBeforeFirst,
                        events: raw.events,
                    })
                }),
                detail: Effect.fn('Capture.detail')(
                    function* (capture, packetId, registryRevision, analysisRevision) {
                        yield* requireCapture(capture)
                        const value = yield* worker
                            .request({
                                op: 'detail',
                                ...captureHalves(capture),
                                packetId,
                                registryRevision:
                                    registryRevision ?? activeSession?.registryRevision ?? '0',
                                analysisRevision:
                                    analysisRevision ?? activeSession?.registryRevision ?? '0',
                            })
                            .pipe(Effect.mapError(rpcError))
                        const failure = Schema.decodeUnknownEither(FailureResponse)(value)
                        if (Either.isRight(failure)) return yield* workerFailure(failure.right)
                        const raw = yield* decode(DetailResponse, value)
                        yield* requireResponseCapture(capture, raw)
                        if (
                            !isAbsolute(raw.dataPath) ||
                            !basename(raw.dataPath).startsWith('detail-') ||
                            !basename(raw.dataPath).endsWith('.prt2')
                        ) {
                            return yield* new PacketDataCorrupted({
                                title: 'Capture worker returned an invalid detail path',
                            })
                        }
                        const expectedLength = BigInt(raw.byteLength)
                        const bytes = yield* Effect.tryPromise({
                            try: () => readFile(raw.dataPath),
                            catch: () =>
                                new PacketDataCorrupted({
                                    title: 'Packet detail file is unavailable',
                                }),
                        }).pipe(
                            Effect.ensuring(
                                Effect.promise(() => unlink(raw.dataPath).catch(() => undefined)),
                            ),
                        )
                        if (BigInt(bytes.byteLength) !== expectedLength) {
                            return yield* new PacketDataCorrupted({
                                title: 'Packet detail length does not match the worker response',
                            })
                        }
                        return Uint8Array.from(bytes)
                    },
                ),
            })
        }),
    )
}

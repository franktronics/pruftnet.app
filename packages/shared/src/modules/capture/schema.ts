import { Schema } from 'effect'

export const DecimalString = Schema.String.pipe(Schema.pattern(/^(0|[1-9][0-9]*)$/))
export const CaptureId = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/))

export class PacketKey extends Schema.Class<PacketKey>('PacketKey')({
    captureId: CaptureId,
    packetId: DecimalString,
}) {}

export class ReplayCaptureSource extends Schema.TaggedClass<ReplayCaptureSource>()('Replay', {
    fileId: Schema.NonEmptyString,
}) {}

export class LiveCaptureInterface extends Schema.Class<LiveCaptureInterface>(
    'LiveCaptureInterface',
)({
    name: Schema.NonEmptyString,
    promiscuous: Schema.Boolean,
    monitorMode: Schema.Boolean,
    linkType: Schema.NullOr(Schema.Int),
    timestampType: Schema.NullOr(Schema.NonEmptyString),
}) {}

export class LiveCaptureSource extends Schema.TaggedClass<LiveCaptureSource>()('Live', {
    interfaces: Schema.NonEmptyArray(LiveCaptureInterface),
    bpfFilter: Schema.String.pipe(Schema.maxLength(4096)),
    snaplen: Schema.Number.pipe(Schema.int(), Schema.between(64, 262_144)),
    pcapBufferSizeBytes: Schema.Number.pipe(Schema.int(), Schema.between(1_048_576, 536_870_912)),
    readTimeoutMs: Schema.Number.pipe(Schema.int(), Schema.between(0, 10_000)),
    dispatchBatchSize: Schema.Number.pipe(Schema.int(), Schema.between(1, 4096)),
    ringSlots: Schema.Number.pipe(Schema.int(), Schema.between(64, 262_144)),
    captureQueueBytes: Schema.Number.pipe(Schema.int(), Schema.between(1_048_576, 1_073_741_824)),
    maxTotalRingBytes: Schema.Number.pipe(Schema.int(), Schema.between(1_048_576, 1_073_741_824)),
    spoolMaxTotalBytes: DecimalString,
    spoolSegmentBytes: DecimalString,
    spoolMaxSegments: Schema.Number.pipe(Schema.int(), Schema.between(0, 65_536)),
    spoolRingMode: Schema.Boolean,
    spoolTemporary: Schema.Boolean,
}) {}

export const CaptureSource = Schema.Union(ReplayCaptureSource, LiveCaptureSource)
export type CaptureSource = Schema.Schema.Type<typeof CaptureSource>

export const CaptureSessionState = Schema.Literal(
    'starting',
    'running',
    'stopping',
    'stopped',
    'completed',
    'failed',
)

export class CaptureSession extends Schema.Class<CaptureSession>('CaptureSession')({
    captureId: CaptureId,
    state: CaptureSessionState,
    source: CaptureSource,
    registryRevision: DecimalString,
    startedAtNs: DecimalString,
    stoppedAtNs: Schema.NullOr(DecimalString),
    failure: Schema.NullOr(Schema.String),
}) {}

export const DurableCaptureState = Schema.Literal(
    'preparing',
    'capturing',
    'stopping',
    'stopped',
    'failed',
    'interrupted',
    'recovering',
    'deleting',
    'deleted',
)
export type DurableCaptureState = Schema.Schema.Type<typeof DurableCaptureState>

export class CaptureFailure extends Schema.Class<CaptureFailure>('CaptureFailure')({
    code: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
    recoverable: Schema.Boolean,
}) {}

export class CaptureRecord extends Schema.Class<CaptureRecord>('CaptureRecord')({
    captureId: CaptureId,
    state: DurableCaptureState,
    source: CaptureSource,
    interfaceNames: Schema.Array(Schema.String),
    sourceFormat: Schema.Literal('pcapng', 'pcap'),
    registryRevision: DecimalString,
    startedAtNs: DecimalString,
    stoppedAtNs: Schema.NullOr(DecimalString),
    packetCount: DecimalString,
    retainedBytes: DecimalString,
    retainedPortionOnly: Schema.Boolean,
    failure: Schema.NullOr(CaptureFailure),
    exportCount: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
}) {}

export class CaptureRecordList extends Schema.Class<CaptureRecordList>('CaptureRecordList')({
    captures: Schema.Array(CaptureRecord),
}) {}

export class OpenCaptureResult extends Schema.Class<OpenCaptureResult>('OpenCaptureResult')({
    capture: CaptureRecord,
    session: CaptureSession,
}) {}

export const ExportState = Schema.Literal(
    'queued',
    'preparing',
    'running',
    'finalizing',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
)
export type ExportState = Schema.Schema.Type<typeof ExportState>

export const ExportFormat = Schema.Literal('pcapng', 'pcap')
export type ExportFormat = Schema.Schema.Type<typeof ExportFormat>

export class DesktopExportDestination extends Schema.TaggedClass<DesktopExportDestination>()(
    'Desktop',
    { destinationToken: Schema.NonEmptyString },
) {}

export class ServerExportDestination extends Schema.TaggedClass<ServerExportDestination>()(
    'Server',
    {},
) {}

export const ExportDestination = Schema.Union(DesktopExportDestination, ServerExportDestination)
export type ExportDestination = Schema.Schema.Type<typeof ExportDestination>

export class ExportFailure extends Schema.Class<ExportFailure>('ExportFailure')({
    code: Schema.NonEmptyString,
    message: Schema.NonEmptyString,
    retryable: Schema.Boolean,
}) {}

export class ExportJob extends Schema.Class<ExportJob>('ExportJob')({
    exportId: Schema.NonEmptyString,
    captureId: CaptureId,
    state: ExportState,
    format: ExportFormat,
    destinationKind: Schema.Literal('desktop', 'server'),
    packetsTotal: DecimalString,
    packetsWritten: DecimalString,
    bytesWritten: DecimalString,
    retainedPortionOnly: Schema.Boolean,
    cancelRequested: Schema.Boolean,
    checksumSha256: Schema.NullOr(Schema.String),
    finalSize: Schema.NullOr(DecimalString),
    failure: Schema.NullOr(ExportFailure),
    createdAtNs: DecimalString,
    startedAtNs: Schema.NullOr(DecimalString),
    completedAtNs: Schema.NullOr(DecimalString),
    artifactAvailable: Schema.Boolean,
    downloadPath: Schema.NullOr(Schema.String),
}) {}

export class ExportJobList extends Schema.Class<ExportJobList>('ExportJobList')({
    exports: Schema.Array(ExportJob),
}) {}

export class CreateExportRequest extends Schema.Class<CreateExportRequest>('CreateExportRequest')({
    captureId: CaptureId,
    format: ExportFormat,
    destination: ExportDestination,
    idempotencyKey: Schema.NonEmptyString.pipe(Schema.maxLength(128)),
}) {}

export class ExportIdRequest extends Schema.Class<ExportIdRequest>('ExportIdRequest')({
    exportId: Schema.NonEmptyString,
}) {}

export class ListExportsRequest extends Schema.Class<ListExportsRequest>('ListExportsRequest')({
    captureId: Schema.optional(CaptureId),
}) {}

export class StartCaptureRequest extends Schema.Class<StartCaptureRequest>('StartCaptureRequest')({
    source: CaptureSource,
}) {}

export class CaptureIdRequest extends Schema.Class<CaptureIdRequest>('CaptureIdRequest')({
    captureId: CaptureId,
}) {}

export class CaptureInterfaceRequest extends Schema.Class<CaptureInterfaceRequest>(
    'CaptureInterfaceRequest',
)({
    name: Schema.NonEmptyString,
    monitorMode: Schema.Boolean,
}) {}

export class CaptureInterfaceAddress extends Schema.Class<CaptureInterfaceAddress>(
    'CaptureInterfaceAddress',
)({
    family: Schema.Literal('IPv4', 'IPv6'),
    address: Schema.NonEmptyString,
}) {}

export class CaptureInterface extends Schema.Class<CaptureInterface>('CaptureInterface')({
    name: Schema.NonEmptyString,
    description: Schema.String,
    addresses: Schema.Array(CaptureInterfaceAddress),
    isLoopback: Schema.Boolean,
    isUp: Schema.Boolean,
    isRunning: Schema.Boolean,
    isWireless: Schema.Boolean,
}) {}

export class CaptureLinkType extends Schema.Class<CaptureLinkType>('CaptureLinkType')({
    value: Schema.Int,
    name: Schema.String,
    description: Schema.String,
    isDefault: Schema.Boolean,
    parserSupported: Schema.Boolean,
}) {}

export class CaptureTimestampType extends Schema.Class<CaptureTimestampType>(
    'CaptureTimestampType',
)({
    value: Schema.Int,
    name: Schema.String,
    description: Schema.String,
}) {}

export class CaptureInterfaceCapabilities extends Schema.Class<CaptureInterfaceCapabilities>(
    'CaptureInterfaceCapabilities',
)({
    name: Schema.NonEmptyString,
    canSetMonitorMode: Schema.Boolean,
    linkTypes: Schema.Array(CaptureLinkType),
    timestampTypes: Schema.Array(CaptureTimestampType),
    warnings: Schema.Array(Schema.String),
}) {}

export class PacketSummaryColumn extends Schema.Class<PacketSummaryColumn>('PacketSummaryColumn')({
    key: Schema.Literal('source', 'destination', 'protocol', 'length', 'info'),
    value: Schema.String.pipe(Schema.maxLength(256)),
}) {}

export class PacketSummary extends Schema.Class<PacketSummary>('PacketSummary')({
    cursor: DecimalString,
    key: PacketKey,
    timestampNs: DecimalString,
    interfaceId: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    capturedLength: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    wireLength: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    linkType: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    captureFlags: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    parseCondition: Schema.Literal('complete', 'partial', 'malformed', 'resourceLimit'),
    protocolPath: Schema.Array(Schema.Number.pipe(Schema.int(), Schema.positive())),
    columns: Schema.Array(PacketSummaryColumn),
    analysisRevision: DecimalString,
}) {}

export class ReadPacketSummariesRequest extends Schema.Class<ReadPacketSummariesRequest>(
    'ReadPacketSummariesRequest',
)({
    captureId: CaptureId,
    afterCursor: Schema.optional(DecimalString),
    limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 1024)),
}) {}

export class PacketSummaryBatch extends Schema.Class<PacketSummaryBatch>('PacketSummaryBatch')({
    captureId: CaptureId,
    firstCursor: Schema.NullOr(DecimalString),
    lastCursor: Schema.NullOr(DecimalString),
    oldestAvailableCursor: Schema.NullOr(DecimalString),
    newestAvailableCursor: Schema.NullOr(DecimalString),
    gapBeforeFirst: Schema.Boolean,
    captureComplete: Schema.Boolean,
    summaries: Schema.Array(PacketSummary),
}) {}

export class RegistryRevisionRequest extends Schema.Class<RegistryRevisionRequest>(
    'RegistryRevisionRequest',
)({
    registryRevision: DecimalString,
}) {}

export class ProtocolDescriptor extends Schema.Class<ProtocolDescriptor>('ProtocolDescriptor')({
    id: Schema.Number.pipe(Schema.int(), Schema.positive()),
    key: Schema.NonEmptyString,
    displayName: Schema.NonEmptyString,
    visibilityFlags: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
}) {}

export class FieldDescriptor extends Schema.Class<FieldDescriptor>('FieldDescriptor')({
    id: Schema.Number.pipe(Schema.int(), Schema.positive()),
    protocolId: Schema.Number.pipe(Schema.int(), Schema.positive()),
    key: Schema.NonEmptyString,
    displayName: Schema.NonEmptyString,
    valueType: Schema.Literal(
        'protocol',
        'unsigned',
        'signed',
        'boolean',
        'bytes',
        'string',
        'generatedText',
    ),
    visibilityFlags: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
}) {}

export class RegistrySnapshot extends Schema.Class<RegistrySnapshot>('RegistrySnapshot')({
    registryRevision: DecimalString,
    protocols: Schema.Array(ProtocolDescriptor),
    fields: Schema.Array(FieldDescriptor),
}) {}

export class InterfaceCaptureStats extends Schema.Class<InterfaceCaptureStats>(
    'InterfaceCaptureStats',
)({
    interfaceId: Schema.Number.pipe(Schema.int(), Schema.nonNegative()),
    interfaceName: Schema.String,
    linkType: Schema.Int,
    packetsObserved: DecimalString,
    captureQueueAccepted: DecimalString,
    captureQueueFullDrops: DecimalString,
    captureQueueOversizeDrops: DecimalString,
    invalidCallbackDrops: DecimalString,
    pcapDispatchCalls: DecimalString,
    pcapDispatchErrors: DecimalString,
    pcapStatsReadFailures: DecimalString,
    pcapReceived: DecimalString,
    pcapKernelDrops: DecimalString,
    pcapInterfaceDrops: DecimalString,
    captureQueueDepth: DecimalString,
    captureQueueCapacityPackets: DecimalString,
    captureQueueCapacityBytes: DecimalString,
    captureQueueBytes: DecimalString,
    captureQueueMaxDepth: DecimalString,
    captureQueueMaxBytes: DecimalString,
    captureThreadRunning: Schema.Boolean,
}) {}

export class CaptureStats extends Schema.Class<CaptureStats>('CaptureStats')({
    captureId: CaptureId,
    interfaces: Schema.Array(InterfaceCaptureStats),
    packetsObserved: DecimalString,
    captureQueueAccepted: DecimalString,
    captureQueueFullDrops: DecimalString,
    captureQueueOversizeDrops: DecimalString,
    invalidCallbackDrops: DecimalString,
    pcapDispatchCalls: DecimalString,
    pcapDispatchErrors: DecimalString,
    pcapStatsReadFailures: DecimalString,
    pcapReceived: DecimalString,
    pcapKernelDrops: DecimalString,
    pcapInterfaceDrops: DecimalString,
    captureQueueDepth: DecimalString,
    captureQueueCapacityPackets: DecimalString,
    captureQueueCapacityBytes: DecimalString,
    captureQueueBytes: DecimalString,
    captureQueueMaxDepth: DecimalString,
    captureQueueMaxBytes: DecimalString,
    packetsPersisted: DecimalString,
    spoolBytesWritten: DecimalString,
    spoolWriteRate: DecimalString,
    spoolSegments: DecimalString,
    spoolQuotaBytes: DecimalString,
    spoolBytesRetained: DecimalString,
    spoolEvictedPackets: DecimalString,
    spoolEvictedBytes: DecimalString,
    spoolWriteFailures: DecimalString,
    spoolFlushFailures: DecimalString,
    lastCommittedPacketId: DecimalString,
    writerInFlight: DecimalString,
    terminalWriteLosses: DecimalString,
    packetsAvailableForAnalysis: DecimalString,
    packetsAnalyzed: DecimalString,
    analysisBacklogPackets: DecimalString,
    analysisBacklogBytes: DecimalString,
    analysisErrors: DecimalString,
    analysisResourceLimits: DecimalString,
    summaryCount: DecimalString,
    summaryOldestCursor: Schema.NullOr(DecimalString),
    summaryNewestCursor: Schema.NullOr(DecimalString),
    analysisGapCount: DecimalString,
    analysisEvictedBeforeAnalysis: DecimalString,
    analysisRejects: DecimalString,
    writerRunning: Schema.Boolean,
    analyzerRunning: Schema.Boolean,
}) {}

export class CaptureStatSample extends Schema.Class<CaptureStatSample>('CaptureStatSample')({
    sampledAtNs: DecimalString,
    stats: CaptureStats,
}) {}

export class CaptureStatSampleList extends Schema.Class<CaptureStatSampleList>(
    'CaptureStatSampleList',
)({
    samples: Schema.Array(CaptureStatSample),
}) {}

export class ListCaptureStatSamplesRequest extends Schema.Class<ListCaptureStatSamplesRequest>(
    'ListCaptureStatSamplesRequest',
)({
    captureId: CaptureId,
    limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 10_000)),
}) {}

export class ReadCaptureEventsRequest extends Schema.Class<ReadCaptureEventsRequest>(
    'ReadCaptureEventsRequest',
)({
    captureId: CaptureId,
    afterCursor: Schema.optional(DecimalString),
    limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 512)),
}) {}

export class CaptureEvent extends Schema.Class<CaptureEvent>('CaptureEvent')({
    cursor: DecimalString,
    timestampNs: DecimalString,
    severity: Schema.Literal('info', 'warning', 'error', 'fatal'),
    code: Schema.String,
    message: Schema.String,
    recoverable: Schema.Boolean,
    interfaceId: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.nonNegative())),
}) {}

export class CaptureEventBatch extends Schema.Class<CaptureEventBatch>('CaptureEventBatch')({
    captureId: CaptureId,
    gapBeforeFirst: Schema.Boolean,
    events: Schema.Array(CaptureEvent),
}) {}

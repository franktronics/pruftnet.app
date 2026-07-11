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

export class LiveCaptureSource extends Schema.TaggedClass<LiveCaptureSource>()('Live', {
    interfaces: Schema.NonEmptyArray(Schema.NonEmptyString),
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
}) {}

export class CaptureInterface extends Schema.Class<CaptureInterface>('CaptureInterface')({
    name: Schema.NonEmptyString,
    description: Schema.String,
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
    value: Schema.String,
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
    packetsSeen: DecimalString,
    packetsEnqueued: DecimalString,
    packetsParsed: DecimalString,
    appRingDrops: DecimalString,
    pcapDispatchCalls: DecimalString,
    pcapDispatchErrors: DecimalString,
    pcapReceived: DecimalString,
    pcapDropped: DecimalString,
    pcapInterfaceDropped: DecimalString,
    ringDepth: DecimalString,
    ringCapacity: DecimalString,
    maxRingDepth: DecimalString,
    captureThreadRunning: Schema.Boolean,
}) {}

export class CaptureStats extends Schema.Class<CaptureStats>('CaptureStats')({
    captureId: CaptureId,
    interfaces: Schema.Array(InterfaceCaptureStats),
    packetsSeen: DecimalString,
    packetsEnqueued: DecimalString,
    packetsParsed: DecimalString,
    appRingDrops: DecimalString,
    pcapReceived: DecimalString,
    pcapDropped: DecimalString,
    pcapInterfaceDropped: DecimalString,
    retainedPackets: DecimalString,
    retainedBytes: DecimalString,
    retentionEvictions: DecimalString,
    ipcDrops: DecimalString,
    parserThreadRunning: Schema.Boolean,
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

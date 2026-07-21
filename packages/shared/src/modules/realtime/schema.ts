import { Schema } from 'effect'

import {
    CaptureId,
    CaptureRecord,
    CaptureSession,
    CaptureStatSample,
    CaptureStats,
    DecimalString,
    ExportJob,
} from '#shared/modules/capture'

export const BackendInstanceId = Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/))

export class ApplicationStreamReady extends Schema.TaggedClass<ApplicationStreamReady>()(
    'ApplicationStreamReady',
    {
        instanceId: BackendInstanceId,
        sequence: DecimalString,
    },
) {}

export class ApplicationHeartbeat extends Schema.TaggedClass<ApplicationHeartbeat>()(
    'ApplicationHeartbeat',
    {
        instanceId: BackendInstanceId,
        sequence: DecimalString,
    },
) {}

export class CaptureRecordChanged extends Schema.TaggedClass<CaptureRecordChanged>()(
    'CaptureRecordChanged',
    {
        sequence: DecimalString,
        capture: CaptureRecord,
    },
) {}

export class CaptureRecordDeleted extends Schema.TaggedClass<CaptureRecordDeleted>()(
    'CaptureRecordDeleted',
    {
        sequence: DecimalString,
        captureId: CaptureId,
    },
) {}

export class ExportJobChanged extends Schema.TaggedClass<ExportJobChanged>()('ExportJobChanged', {
    sequence: DecimalString,
    job: ExportJob,
}) {}

export class ServerShuttingDown extends Schema.TaggedClass<ServerShuttingDown>()(
    'ServerShuttingDown',
    {
        sequence: DecimalString,
    },
) {}

export const ApplicationChange = Schema.Union(
    ApplicationStreamReady,
    ApplicationHeartbeat,
    CaptureRecordChanged,
    CaptureRecordDeleted,
    ExportJobChanged,
    ServerShuttingDown,
)
export type ApplicationChange = Schema.Schema.Type<typeof ApplicationChange>

export class CaptureStreamReady extends Schema.TaggedClass<CaptureStreamReady>()(
    'CaptureStreamReady',
    {
        instanceId: BackendInstanceId,
        captureId: CaptureId,
        sequence: DecimalString,
    },
) {}

export class CaptureHeartbeat extends Schema.TaggedClass<CaptureHeartbeat>()('CaptureHeartbeat', {
    instanceId: BackendInstanceId,
    captureId: CaptureId,
    sequence: DecimalString,
}) {}

export class CaptureLiveSnapshot extends Schema.TaggedClass<CaptureLiveSnapshot>()(
    'CaptureLiveSnapshot',
    {
        sequence: DecimalString,
        captureId: CaptureId,
        session: CaptureSession,
        stats: Schema.NullOr(CaptureStats),
        statSample: Schema.NullOr(CaptureStatSample),
        summaryCursor: Schema.NullOr(DecimalString),
        eventCursor: Schema.NullOr(DecimalString),
        terminal: Schema.Boolean,
    },
) {}

export class CaptureDataAvailable extends Schema.TaggedClass<CaptureDataAvailable>()(
    'CaptureDataAvailable',
    {
        sequence: DecimalString,
        captureId: CaptureId,
        summaryCursor: Schema.NullOr(DecimalString),
        eventCursor: Schema.NullOr(DecimalString),
    },
) {}

export const CaptureChange = Schema.Union(
    CaptureStreamReady,
    CaptureHeartbeat,
    CaptureLiveSnapshot,
    CaptureDataAvailable,
)
export type CaptureChange = Schema.Schema.Type<typeof CaptureChange>

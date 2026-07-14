import { Schema } from 'effect'
import { BasicErrorFields } from '#shared/utils/error-model'

export class CaptureAlreadyRunning extends Schema.TaggedError<CaptureAlreadyRunning>()(
    'CaptureAlreadyRunning',
    {
        ...BasicErrorFields,
        activeCaptureId: Schema.optional(Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/))),
    },
) {}
export class CaptureNotFound extends Schema.TaggedError<CaptureNotFound>()(
    'CaptureNotFound',
    BasicErrorFields,
) {}
export class CaptureSourceUnsupported extends Schema.TaggedError<CaptureSourceUnsupported>()(
    'CaptureSourceUnsupported',
    BasicErrorFields,
) {}
export class CaptureOptionsInvalid extends Schema.TaggedError<CaptureOptionsInvalid>()(
    'CaptureOptionsInvalid',
    BasicErrorFields,
) {}
export class CaptureWorkerUnavailable extends Schema.TaggedError<CaptureWorkerUnavailable>()(
    'CaptureWorkerUnavailable',
    BasicErrorFields,
) {}
export class CaptureWorkerCrashed extends Schema.TaggedError<CaptureWorkerCrashed>()(
    'CaptureWorkerCrashed',
    BasicErrorFields,
) {}
export class PacketNotFound extends Schema.TaggedError<PacketNotFound>()(
    'PacketNotFound',
    BasicErrorFields,
) {}
export class PacketEvicted extends Schema.TaggedError<PacketEvicted>()(
    'PacketEvicted',
    BasicErrorFields,
) {}
export class PacketDetailPending extends Schema.TaggedError<PacketDetailPending>()(
    'PacketDetailPending',
    BasicErrorFields,
) {}
export class PacketDataCorrupted extends Schema.TaggedError<PacketDataCorrupted>()(
    'PacketDataCorrupted',
    BasicErrorFields,
) {}
export class RegistryUnavailable extends Schema.TaggedError<RegistryUnavailable>()(
    'RegistryUnavailable',
    BasicErrorFields,
) {}
export class ReplayFailed extends Schema.TaggedError<ReplayFailed>()(
    'ReplayFailed',
    BasicErrorFields,
) {}
export class LiveCaptureFailed extends Schema.TaggedError<LiveCaptureFailed>()(
    'LiveCaptureFailed',
    BasicErrorFields,
) {}
export class CaptureStorageUnavailable extends Schema.TaggedError<CaptureStorageUnavailable>()(
    'CaptureStorageUnavailable',
    BasicErrorFields,
) {}
export class CaptureInUse extends Schema.TaggedError<CaptureInUse>()(
    'CaptureInUse',
    BasicErrorFields,
) {}
export class ExportNotFound extends Schema.TaggedError<ExportNotFound>()(
    'ExportNotFound',
    BasicErrorFields,
) {}
export class ExportOptionsInvalid extends Schema.TaggedError<ExportOptionsInvalid>()(
    'ExportOptionsInvalid',
    BasicErrorFields,
) {}
export class ExportUnavailable extends Schema.TaggedError<ExportUnavailable>()(
    'ExportUnavailable',
    BasicErrorFields,
) {}

export const CaptureRpcError = Schema.Union(
    CaptureAlreadyRunning,
    CaptureNotFound,
    CaptureSourceUnsupported,
    CaptureOptionsInvalid,
    CaptureWorkerUnavailable,
    CaptureWorkerCrashed,
    PacketNotFound,
    PacketEvicted,
    PacketDetailPending,
    PacketDataCorrupted,
    RegistryUnavailable,
    ReplayFailed,
    LiveCaptureFailed,
    CaptureStorageUnavailable,
    CaptureInUse,
    ExportNotFound,
    ExportOptionsInvalid,
    ExportUnavailable,
)

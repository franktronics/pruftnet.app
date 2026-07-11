import { Schema } from 'effect'
import { BasicErrorFields } from '../../utils/error-model'

export class CaptureAlreadyRunning extends Schema.TaggedError<CaptureAlreadyRunning>()(
    'CaptureAlreadyRunning',
    BasicErrorFields,
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
export class RegistryUnavailable extends Schema.TaggedError<RegistryUnavailable>()(
    'RegistryUnavailable',
    BasicErrorFields,
) {}
export class ReplayFailed extends Schema.TaggedError<ReplayFailed>()(
    'ReplayFailed',
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
    RegistryUnavailable,
    ReplayFailed,
)

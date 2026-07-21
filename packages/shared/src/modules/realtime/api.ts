import { Rpc, RpcGroup } from '@effect/rpc'
import { CaptureIdRequest, CaptureRpcError } from '#shared/modules/capture'

import { ApplicationChange, CaptureChange } from './schema'

export class RealtimeRpcs extends RpcGroup.make(
    Rpc.make('WatchApplicationChanges', {
        success: ApplicationChange,
        error: CaptureRpcError,
        stream: true,
    }),
    Rpc.make('WatchCaptureChanges', {
        payload: CaptureIdRequest,
        success: CaptureChange,
        error: CaptureRpcError,
        stream: true,
    }),
) {}

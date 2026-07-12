import { RpcClient } from '@effect/rpc'
import { CaptureRpcs, ReplayCaptureSource } from '@repo/shared/capture'
import { Effect } from 'effect'

import { RpcClientLive } from '../../../config/rpc-client'
import { runEffectPromise } from '../../../utils/run-effect-promise'

const clientEffect = RpcClient.make(CaptureRpcs).pipe(Effect.provide(RpcClientLive))

async function call<A>(
    use: (client: Effect.Effect.Success<typeof clientEffect>) => Effect.Effect<A, unknown>,
) {
    const program = Effect.flatMap(clientEffect, use).pipe(
        Effect.scoped,
        Effect.provide(RpcClientLive),
    )
    return runEffectPromise(program)
}

export const captureClient = {
    session: (captureId: string) => call((client) => client.GetCaptureSession({ captureId })),
    start: (fileId: string) =>
        call((client) => client.StartCapture({ source: new ReplayCaptureSource({ fileId }) })),
    stop: (captureId: string) => call((client) => client.StopCapture({ captureId })),
    stats: (captureId: string) => call((client) => client.GetCaptureStats({ captureId })),
    summaries: (captureId: string, afterCursor?: string) =>
        call((client) => client.ReadPacketSummaries({ captureId, afterCursor, limit: 1024 })),
    events: (captureId: string, afterCursor?: string) =>
        call((client) => client.ReadCaptureEvents({ captureId, afterCursor, limit: 512 })),
    registry: (registryRevision: string) =>
        call((client) => client.GetRegistrySnapshot({ registryRevision })),
}

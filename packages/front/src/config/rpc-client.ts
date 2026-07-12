import { RpcClient, RpcSerialization } from '@effect/rpc'
import { FetchHttpClient } from '@effect/platform'
import { Layer } from 'effect'

function getRpcUrl() {
    if (typeof window === 'undefined') {
        return 'http://127.0.0.1:3000/rpc'
    }

    return window.pruftnet?.rpcUrl ?? new URL('/rpc', window.location.origin).toString()
}

export function getRpcEndpoint() {
    return new URL(getRpcUrl())
}

export const RpcClientLive = RpcClient.layerProtocolHttp({ url: getRpcUrl() }).pipe(
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
)

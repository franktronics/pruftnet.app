import type { IncomingMessage, ServerResponse } from 'node:http'

import { NodeHttpServer } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcGroup } from '@repo/shared'
import { Effect, Scope } from 'effect'

import { AppLayer } from './app'
import { makePacketDetailNodeHandler } from './capture/detail-http'

export const makeAppNodeHandlers = Effect.gen(function* () {
    const app = yield* RpcServer.toHttpApp(AppRpcGroup)
    const rpc = yield* NodeHttpServer.makeHandler(app)
    const packetDetail = yield* makePacketDetailNodeHandler
    return { rpc, packetDetail } as const
}).pipe(Effect.provide(AppLayer), Effect.provide(RpcSerialization.layerNdjson))

export const makeAppRpcNodeHandler: Effect.Effect<
    (request: IncomingMessage, response: ServerResponse) => void,
    Error,
    Scope.Scope
> = RpcServer.toHttpApp(AppRpcGroup).pipe(
    Effect.provide(AppLayer),
    Effect.provide(RpcSerialization.layerNdjson),
    Effect.flatMap((app) => NodeHttpServer.makeHandler(app)),
)

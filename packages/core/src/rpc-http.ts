import type { IncomingMessage, ServerResponse } from 'node:http'

import { NodeHttpServer } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcGroup } from '@repo/shared'
import { Effect, Layer, Scope } from 'effect'

import { AppLayer } from './app'
import { makePacketDetailNodeHandler } from './capture/detail-http'

export const makeAppNodeHandlers = Effect.gen(function* () {
    const context = yield* Layer.build(AppLayer)
    const app = yield* RpcServer.toHttpApp(AppRpcGroup).pipe(Effect.provide(context))
    const rpc = yield* NodeHttpServer.makeHandler(app)
    const packetDetail = yield* makePacketDetailNodeHandler.pipe(Effect.provide(context))
    return { rpc, packetDetail } as const
}).pipe(Effect.provide(RpcSerialization.layerNdjson))

export const makeAppRpcNodeHandler: Effect.Effect<
    (request: IncomingMessage, response: ServerResponse) => void,
    Error,
    Scope.Scope
> = makeAppNodeHandlers.pipe(Effect.map((handlers) => handlers.rpc))

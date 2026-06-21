import type { IncomingMessage, ServerResponse } from 'node:http'

import { NodeHttpServer } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcGroup } from '@repo/shared'
import { Effect, Scope } from 'effect'

import { AppLayer } from './app'

export const makeAppRpcNodeHandler: Effect.Effect<
    (request: IncomingMessage, response: ServerResponse) => void,
    never,
    Scope.Scope
> = RpcServer.toHttpApp(AppRpcGroup).pipe(
    Effect.provide(AppLayer),
    Effect.provide(RpcSerialization.layerNdjson),
    Effect.flatMap((app) => NodeHttpServer.makeHandler(app)),
)

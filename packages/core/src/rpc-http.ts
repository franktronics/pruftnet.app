import { NodeHttpServer } from '@effect/platform-node'
import { RpcSerialization, RpcServer } from '@effect/rpc'
import { AppRpcGroup } from '@repo/shared'
import { Effect, Layer } from 'effect'

import { makeAppLayer, type AppLayerOptions } from './app'
import { ShutdownCoordinator } from './shutdown'
import { makePacketDetailNodeHandler } from './capture/detail-http'
import { makeExportDownloadNodeHandler } from './capture/export-download-http'

export function makeAppNodeHandlers(options: AppLayerOptions) {
    return Effect.gen(function* () {
        const context = yield* Layer.build(makeAppLayer(options))
        const app = yield* RpcServer.toHttpApp(AppRpcGroup).pipe(Effect.provide(context))
        const rpc = yield* NodeHttpServer.makeHandler(app)
        const packetDetail = yield* makePacketDetailNodeHandler.pipe(Effect.provide(context))
        const exportDownload = yield* makeExportDownloadNodeHandler.pipe(Effect.provide(context))
        const shutdown = yield* ShutdownCoordinator.pipe(Effect.provide(context))
        return { rpc, packetDetail, exportDownload, shutdown, context } as const
    }).pipe(Effect.provide(RpcSerialization.layerNdjson))
}

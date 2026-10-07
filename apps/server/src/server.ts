import type { IncomingMessage, Server as NodeServer, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

import { Data, Effect, Exit, Scope } from 'effect'
import {
    beginNodeServerClose,
    isPacketDetailPath,
    makeAppNodeHandlers,
    releaseChannel,
    releaseName,
    releaseVersion,
} from '@repo/core'

import type { RuntimePaths } from './runtime-paths'
import type { Host } from '#server/settings/settings'
import { serveStaticFrontend } from './http/static-files'
import { createViteDevServer, serveViteFrontend } from './http/vite-dev'

/** Number of consecutive ports tried when `strictPort` is disabled. */
const PORT_ATTEMPTS = 10

export interface ServerOptions {
    readonly host: Host
    readonly port: number
    readonly strictPort: boolean
    readonly dataDir: string
    readonly paths: RuntimePaths
}

type StartedServer = {
    readonly url: string
    readonly port: number
    readonly close: Effect.Effect<void, Error>
}

export class PortUnavailable extends Data.TaggedError('PortUnavailable')<{
    readonly host: string
    readonly port: number
    readonly reason: 'in_use' | 'permission_denied' | 'unavailable'
    readonly message: string
}> {}

/** Body of `GET /health`, also used by `doctor` to recognize a running Pruftnet server. */
export interface HealthResponse {
    readonly status: 'ok'
    readonly name: string
    readonly version: string
    readonly channel: string
}

function sendHealth(response: ServerResponse) {
    const body: HealthResponse = {
        status: 'ok',
        name: releaseName,
        version: releaseVersion,
        channel: releaseChannel,
    }
    response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
    })
    response.end(JSON.stringify(body))
}

export function formatServerUrl(host: string, port: number) {
    return `http://${host === '::1' ? '[::1]' : host}:${port}`
}

function listenOnce(server: NodeServer, host: string, port: number) {
    return Effect.async<void, NodeJS.ErrnoException>((resume) => {
        const onError = (error: NodeJS.ErrnoException) => {
            server.off('listening', onListening)
            resume(Effect.fail(error))
        }
        const onListening = () => {
            server.off('error', onError)
            resume(Effect.void)
        }

        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(port, host)
    })
}

/** Binds the requested port, or the next free ones unless `strictPort` is set. */
export const listen = Effect.fn('listen')(function* (
    server: NodeServer,
    options: Pick<ServerOptions, 'host' | 'port' | 'strictPort'>,
) {
    const attempts = options.strictPort ? 1 : PORT_ATTEMPTS
    const lastPort = Math.min(65535, options.port + attempts - 1)
    for (let port = options.port; port <= lastPort; port += 1) {
        const result = yield* Effect.either(listenOnce(server, options.host, port))
        if (result._tag === 'Right') return port
        const error = result.left
        if (error.code === 'EADDRINUSE' && port < lastPort) {
            yield* Effect.logWarning(`Port ${port} is in use, trying ${port + 1}.`)
            continue
        }
        if (error.code === 'EADDRINUSE') {
            return yield* new PortUnavailable({
                host: options.host,
                port: options.port,
                reason: 'in_use',
                message:
                    port === options.port
                        ? `Port ${port} on ${options.host} is already in use.`
                        : `Ports ${options.port}-${port} on ${options.host} are already in use.`,
            })
        }
        return yield* new PortUnavailable({
            host: options.host,
            port,
            reason: error.code === 'EACCES' ? 'permission_denied' : 'unavailable',
            message: `Unable to listen on ${options.host}:${port}: ${error.message}`,
        })
    }
    return yield* new PortUnavailable({
        host: options.host,
        port: options.port,
        reason: 'unavailable',
        message: `Port ${options.port} is out of range.`,
    })
})

export function startServer(
    options: ServerOptions,
): Effect.Effect<StartedServer, Error | PortUnavailable> {
    const config = options.paths
    return Effect.gen(function* () {
        const backendScope = yield* Scope.make()
        return yield* Effect.gen(function* () {
            const vite =
                config.mode === 'development'
                    ? yield* Effect.promise(() => createViteDevServer(config))
                    : undefined
            if (vite) {
                yield* Scope.addFinalizer(
                    backendScope,
                    Effect.promise(() => vite.close()),
                )
            }
            const serveFrontend = vite
                ? serveViteFrontend(vite, config)
                : (request: IncomingMessage, response: ServerResponse) => {
                      void serveStaticFrontend(request, response, config.frontendDistPath)
                  }
            const handlers = yield* Scope.extend(
                makeAppNodeHandlers({
                    runtime: 'server',
                    environment: config.mode,
                    workspaceRoot: config.workspaceRoot,
                    dataRoot: options.dataDir,
                    migrationsFolder: config.migrationsFolder,
                    captureWorkerPath: config.captureWorkerPath,
                }),
                backendScope,
            )

            const server = createServer((request, response) => {
                const url = new URL(request.url ?? '/', 'http://localhost')

                if (url.pathname === '/health') {
                    sendHealth(response)
                    return
                }

                if (url.pathname === '/rpc') {
                    handlers.rpc(request, response)
                    return
                }

                if (isPacketDetailPath(url.pathname)) {
                    handlers.packetDetail(request, response)
                    return
                }

                if (url.pathname.startsWith('/exports/')) {
                    handlers.exportDownload(request, response)
                    return
                }

                serveFrontend(request, response)
            })

            const port = yield* listen(server, options)
            let closed = false
            const closeServer = Effect.gen(function* () {
                if (closed) return
                yield* handlers.shutdown
                    .shutdownServer()
                    .pipe(Effect.mapError((error) => new Error(error.message, { cause: error })))
                const httpClose = yield* Effect.sync(() => beginNodeServerClose(server))
                yield* handlers.shutdown.closeRealtime()
                yield* Effect.tryPromise({
                    try: () => httpClose,
                    catch: (cause) => new Error('HTTP server shutdown failed.', { cause }),
                })
                yield* Scope.close(backendScope, Exit.succeed(undefined))
                closed = true
            })

            return { url: formatServerUrl(options.host, port), port, close: closeServer }
        }).pipe(Effect.onError((cause) => Scope.close(backendScope, Exit.failCause(cause))))
    })
}

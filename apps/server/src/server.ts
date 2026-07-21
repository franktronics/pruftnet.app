import type { IncomingMessage, Server as NodeServer, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

import { Effect, Exit, Scope } from 'effect'
import { beginNodeServerClose, makeAppNodeHandlers } from '@repo/core'

import type { ServerConfig } from './config'
import { serveStaticFrontend } from './http/static-files'
import { createViteDevServer, serveViteFrontend } from './http/vite-dev'

type StartedServer = {
    readonly address: string
    readonly close: Effect.Effect<void, Error>
}

function sendHealth(response: ServerResponse) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ status: 'ok' }))
}

function listen(server: NodeServer, config: ServerConfig) {
    return Effect.async<void, Error>((resume) => {
        const onError = (error: Error) => {
            server.off('listening', onListening)
            resume(Effect.fail(error))
        }
        const onListening = () => {
            server.off('error', onError)
            resume(Effect.void)
        }

        server.once('error', onError)
        server.once('listening', onListening)
        server.listen(config.port, config.host)
    })
}

export function startServer(config: ServerConfig): Effect.Effect<StartedServer, Error> {
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
                    migrationsFolder: config.migrationsFolder,
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

                if (url.pathname.startsWith('/capture/')) {
                    handlers.packetDetail(request, response)
                    return
                }

                if (url.pathname.startsWith('/exports/')) {
                    handlers.exportDownload(request, response)
                    return
                }

                serveFrontend(request, response)
            })

            yield* listen(server, config)
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

            return {
                address: `http://${config.host}:${config.port}`,
                close: closeServer,
            }
        }).pipe(Effect.onError((cause) => Scope.close(backendScope, Exit.failCause(cause))))
    })
}

import type { IncomingMessage, Server as NodeServer, ServerResponse } from 'node:http'
import { createServer } from 'node:http'

import { Effect, Scope } from 'effect'
import { makeAppNodeHandlers } from '@repo/core'

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

function close(server: NodeServer) {
    return Effect.async<void>((resume) => {
        if (!server.listening) {
            resume(Effect.void)
            return
        }

        server.close(() => resume(Effect.void))
    })
}

export function startServer(
    config: ServerConfig,
): Effect.Effect<StartedServer, Error, Scope.Scope> {
    return Effect.acquireRelease(
        Effect.gen(function* () {
            const vite =
                config.mode === 'development'
                    ? yield* Effect.promise(() => createViteDevServer(config))
                    : undefined
            const serveFrontend = vite
                ? serveViteFrontend(vite, config)
                : (request: IncomingMessage, response: ServerResponse) => {
                      void serveStaticFrontend(request, response, config.frontendDistPath)
                  }
            const handlers = yield* makeAppNodeHandlers({
                runtime: 'server',
                environment: config.mode,
                workspaceRoot: config.workspaceRoot,
                migrationsFolder: config.migrationsFolder,
            })

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

            return {
                address: `http://${config.host}:${config.port}`,
                close: Effect.gen(function* () {
                    yield* handlers.shutdown
                        .shutdownServer()
                        .pipe(
                            Effect.mapError((error) => new Error(error.message, { cause: error })),
                        )
                    yield* close(server)
                    if (vite) {
                        yield* Effect.promise(() => vite.close())
                    }
                }),
            }
        }),
        (server) => server.close.pipe(Effect.catchAll((error) => Effect.logError(error))),
    )
}

import {
    createServer,
    type IncomingMessage,
    type Server as NodeServer,
    type ServerResponse,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    beginNodeServerClose,
    captureWorkerExecutableName,
    isPacketDetailPath,
    makeAppNodeHandlers,
    type ShutdownError,
    type ShutdownStatus,
} from '@repo/core'
import { Effect, Exit, Scope } from 'effect'
import { app } from 'electron'

import type { DesktopExportDestinations } from './export-destinations'
import { rendererOrigin } from './renderer-protocol'

type AppNodeHandlers = Effect.Effect.Success<ReturnType<typeof makeAppNodeHandlers>>

type StartedDesktopRpcServer = {
    readonly rpcUrl: string
    /**
     * Builds the backend once. The server already accepts connections, so the renderer can load
     * in parallel; requests received before this completes wait for it.
     */
    readonly ready: Effect.Effect<void, Error>
    readonly shutdownStatus: Effect.Effect<ShutdownStatus, ShutdownError | Error>
    readonly shutdown: Effect.Effect<void, Error>
    readonly close: Effect.Effect<void, Error>
}

const workspaceRoot = fileURLToPath(new URL('../../../../', import.meta.url))

function listen(server: NodeServer) {
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
        server.listen({ host: '127.0.0.1', port: 0 })
    })
}

const corsHeaders = {
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'b3, content-type, authorization, traceparent, baggage',
}

function setCorsHeaders(
    origin: string,
    response: NodeJS.WritableStream & { setHeader: (name: string, value: string) => void },
) {
    response.setHeader('access-control-allow-origin', origin)
    for (const [name, value] of Object.entries(corsHeaders)) {
        response.setHeader(name, value)
    }
}

function routeRequest(
    handlers: AppNodeHandlers,
    pathname: string,
    request: IncomingMessage,
    response: ServerResponse,
) {
    if (pathname === '/rpc') handlers.rpc(request, response)
    else if (isPacketDetailPath(pathname)) handlers.packetDetail(request, response)
    else handlers.exportDownload(request, response)
}

export function startDesktopRpcServer(
    exportDestinations: DesktopExportDestinations,
): Effect.Effect<StartedDesktopRpcServer, Error> {
    return Effect.gen(function* () {
        const scope = yield* Scope.make()
        return yield* Effect.gen(function* () {
            const token = randomBytes(32).toString('hex')
            let handlers: AppNodeHandlers | undefined
            let startupFailed = false
            const pending: Array<() => void> = []

            const dispatch = (
                pathname: string,
                request: IncomingMessage,
                response: ServerResponse,
            ) => {
                if (handlers) {
                    routeRequest(handlers, pathname, request, response)
                    return
                }
                if (startupFailed) {
                    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
                    response.end('Backend unavailable')
                    return
                }
                pending.push(() => {
                    if (!request.destroyed) dispatch(pathname, request, response)
                })
            }
            const releasePending = () => {
                for (const resume of pending.splice(0)) resume()
            }

            const server = createServer((request, response) => {
                const url = new URL(request.url ?? '/', 'http://localhost')

                if (
                    url.pathname !== '/rpc' &&
                    !isPacketDetailPath(url.pathname) &&
                    !url.pathname.startsWith('/exports/')
                ) {
                    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                    response.end('Not found')
                    return
                }

                if (url.searchParams.get('token') !== token) {
                    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
                    response.end('Forbidden')
                    return
                }

                const origin = request.headers.origin
                if (
                    origin &&
                    origin !== rendererOrigin &&
                    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
                ) {
                    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
                    response.end('Forbidden')
                    return
                }
                if (origin) setCorsHeaders(origin, response)

                if (request.method === 'OPTIONS') {
                    response.writeHead(204)
                    response.end()
                    return
                }

                dispatch(url.pathname, request, response)
            })

            yield* listen(server)

            const address = server.address()
            if (!address || typeof address === 'string') {
                return yield* Effect.fail(
                    new Error('Desktop RPC server did not bind to a TCP port.'),
                )
            }

            const built = yield* Effect.cached(
                Scope.extend(
                    makeAppNodeHandlers({
                        runtime: 'desktop',
                        environment: app.isPackaged ? 'production' : 'development',
                        workspaceRoot,
                        migrationsFolder: app.isPackaged
                            ? join(process.resourcesPath, 'drizzle')
                            : join(workspaceRoot, 'packages/core/drizzle'),
                        captureWorkerPath: app.isPackaged
                            ? join(process.resourcesPath, 'native', captureWorkerExecutableName())
                            : undefined,
                        resolveDesktopDestination: (destinationToken, format) =>
                            exportDestinations.consume(destinationToken, format),
                    }),
                    scope,
                ).pipe(
                    Effect.tap((result) =>
                        Effect.sync(() => {
                            handlers = result
                            releasePending()
                        }),
                    ),
                    Effect.tapErrorCause((cause) =>
                        Effect.sync(() => {
                            startupFailed = true
                            releasePending()
                        }).pipe(Effect.zipRight(Scope.close(scope, Exit.failCause(cause)))),
                    ),
                ),
            )

            return {
                rpcUrl: `http://127.0.0.1:${(address as AddressInfo).port}/rpc?token=${token}`,
                ready: Effect.asVoid(built),
                shutdownStatus: built.pipe(Effect.flatMap((result) => result.shutdown.status())),
                shutdown: built.pipe(
                    Effect.flatMap((result) => result.shutdown.shutdownDesktop()),
                    Effect.mapError((error) => new Error(error.message, { cause: error })),
                ),
                close: Effect.gen(function* () {
                    // Closing the scope while the backend is still being built would race its
                    // finalizers, so wait for the build to settle first.
                    const result = yield* Effect.either(built)
                    const httpClose = yield* Effect.sync(() => beginNodeServerClose(server))
                    if (result._tag === 'Right') yield* result.right.shutdown.closeRealtime()
                    yield* Effect.tryPromise({
                        try: () => httpClose,
                        catch: (cause) =>
                            new Error('Desktop RPC server shutdown failed.', { cause }),
                    })
                    yield* Scope.close(scope, Exit.succeed(undefined))
                }),
            }
        }).pipe(Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))))
    })
}

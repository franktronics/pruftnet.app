import { createServer, type Server as NodeServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'

import { makeAppNodeHandlers } from '@repo/core'
import { Effect, Exit, Scope } from 'effect'

type StartedDesktopRpcServer = {
    readonly rpcUrl: string
    readonly close: Effect.Effect<void>
}

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

function close(server: NodeServer) {
    return Effect.async<void>((resume) => {
        if (!server.listening) {
            resume(Effect.void)
            return
        }

        server.close(() => resume(Effect.void))
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

export const startDesktopRpcServer: Effect.Effect<StartedDesktopRpcServer, Error> = Effect.gen(
    function* () {
        const scope = yield* Scope.make()
        return yield* Effect.gen(function* () {
            const token = randomBytes(32).toString('hex')
            const handlers = yield* Scope.extend(makeAppNodeHandlers, scope)
            const server = createServer((request, response) => {
                const url = new URL(request.url ?? '/', 'http://localhost')

                if (url.pathname !== '/rpc' && !url.pathname.startsWith('/capture/')) {
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
                    origin !== 'null' &&
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

                if (url.pathname === '/rpc') handlers.rpc(request, response)
                else handlers.packetDetail(request, response)
            })

            yield* listen(server)

            const address = server.address()
            if (!address || typeof address === 'string') {
                return yield* Effect.fail(
                    new Error('Desktop RPC server did not bind to a TCP port.'),
                )
            }

            return {
                rpcUrl: `http://127.0.0.1:${(address as AddressInfo).port}/rpc?token=${token}`,
                close: close(server).pipe(
                    Effect.zipRight(Scope.close(scope, Exit.succeed(undefined))),
                ),
            }
        }).pipe(Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause))))
    },
)

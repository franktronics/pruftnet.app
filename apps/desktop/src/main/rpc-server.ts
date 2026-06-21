import { createServer, type Server as NodeServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { makeAppRpcNodeHandler } from '@repo/core'
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
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'b3, content-type, authorization, traceparent, baggage',
}

function setCorsHeaders(response: NodeJS.WritableStream & { setHeader: (name: string, value: string) => void }) {
    for (const [name, value] of Object.entries(corsHeaders)) {
        response.setHeader(name, value)
    }
}

export const startDesktopRpcServer: Effect.Effect<StartedDesktopRpcServer, Error> = Effect.gen(
    function* () {
        const scope = yield* Scope.make()
        const rpcHandler = yield* Scope.extend(makeAppRpcNodeHandler, scope)
        const server = createServer((request, response) => {
            const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)

            if (url.pathname !== '/rpc') {
                response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                response.end('Not found')
                return
            }

            setCorsHeaders(response)

            if (request.method === 'OPTIONS') {
                response.writeHead(204)
                response.end()
                return
            }

            rpcHandler(request, response)
        })

        yield* listen(server)

        const address = server.address()
        if (!address || typeof address === 'string') {
            return yield* Effect.fail(new Error('Desktop RPC server did not bind to a TCP port.'))
        }

        return {
            rpcUrl: `http://127.0.0.1:${(address as AddressInfo).port}/rpc`,
            close: close(server).pipe(Effect.zipRight(Scope.close(scope, Exit.succeed(undefined)))),
        }
    },
)

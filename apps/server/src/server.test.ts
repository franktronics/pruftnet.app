import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { Effect, Either } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { listen, PortUnavailable } from './server'

const servers: Server[] = []

function track(server: Server) {
    servers.push(server)
    return server
}

async function occupiedPort() {
    const blocker = track(createServer())
    await new Promise<void>((done) => blocker.listen(0, '127.0.0.1', done))
    return (blocker.address() as AddressInfo).port
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

describe('listen', () => {
    test('binds the requested port when it is free', async () => {
        const port = await occupiedPort()
        await new Promise((done) => servers.pop()!.close(done))
        const server = track(createServer())
        const bound = await Effect.runPromise(
            listen(server, { host: '127.0.0.1', port, strictPort: true }),
        )
        expect(bound).toBe(port)
    })

    test('tries the next port when the requested one is in use', async () => {
        const port = await occupiedPort()
        const server = track(createServer())
        const bound = await Effect.runPromise(
            listen(server, { host: '127.0.0.1', port, strictPort: false }),
        )
        expect(bound).toBeGreaterThan(port)
        expect((server.address() as AddressInfo).port).toBe(bound)
    })

    test('fails with a typed error in strict mode', async () => {
        const port = await occupiedPort()
        const result = await Effect.runPromise(
            Effect.either(
                listen(track(createServer()), { host: '127.0.0.1', port, strictPort: true }),
            ),
        )
        expect(Either.isLeft(result) && result.left).toBeInstanceOf(PortUnavailable)
        expect(Either.isLeft(result) && result.left.reason).toBe('in_use')
    })
})

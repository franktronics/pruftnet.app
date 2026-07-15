import { type AddressInfo } from 'node:net'
import { createServer, request } from 'node:http'

import {
    PacketDataCorrupted,
    PacketDetailPending,
    PacketEvicted,
    PacketNotFound,
} from '@repo/shared/capture'
import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makePacketDetailNodeHandler } from './detail-http'
import { CaptureSessionManager } from './manager'

const captureId = '00000000000000000000000000000001'
const packetTree = Uint8Array.from([0x50, 0x52, 0x54, 0x32, 0, 1, 2, 3])

let detailStarted!: () => void
let detailCancelled!: () => void
let started: Promise<void>
let cancelled: Promise<void>

const resetCancellation = () => {
    started = new Promise((resolve) => {
        detailStarted = resolve
    })
    cancelled = new Promise((resolve) => {
        detailCancelled = resolve
    })
}

const capture = CaptureSessionManager.of({
    listInterfaces: () => Effect.die('unused'),
    capabilities: () => Effect.die('unused'),
    start: () => Effect.die('unused'),
    stop: () => Effect.die('unused'),
    session: () => Effect.die('unused'),
    summaries: () => Effect.die('unused'),
    registry: () => Effect.die('unused'),
    stats: () => Effect.die('unused'),
    statSamples: () => Effect.die('unused'),
    events: () => Effect.die('unused'),
    detail: (_capture, packetId) => {
        switch (packetId) {
            case '1':
                return Effect.succeed(packetTree)
            case '2':
                return Effect.fail(new PacketNotFound({ title: 'Packet not found' }))
            case '3':
                return Effect.fail(new PacketEvicted({ title: 'Packet evicted' }))
            case '4':
                return Effect.async<Uint8Array>(() => {
                    detailStarted()
                    return Effect.sync(detailCancelled)
                })
            case '5':
                return Effect.fail(new PacketDetailPending({ title: 'Packet detail pending' }))
            case '6':
                return Effect.fail(new PacketDataCorrupted({ title: 'Packet data corrupted' }))
            default:
                return Effect.die('unexpected packet ID')
        }
    },
})

describe('makePacketDetailNodeHandler', () => {
    const server = createServer()
    let origin: string

    beforeAll(async () => {
        resetCancellation()
        const handler = await Effect.runPromise(
            makePacketDetailNodeHandler.pipe(
                Effect.provide(Layer.succeed(CaptureSessionManager, capture)),
            ),
        )
        server.on('request', handler)
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        const address = server.address() as AddressInfo
        origin = `http://127.0.0.1:${address.port}`
    })

    afterAll(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()))
        })
    })

    test('serves binary PRT2 packet detail', async () => {
        const response = await fetch(`${origin}/capture/${captureId}/packets/1`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('application/vnd.pruftnet.packet-tree')
        expect(response.headers.get('cache-control')).toBe('no-store')
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(packetTree)
    })

    test.each([
        ['malformed packet key', `/capture/${captureId}/packets/01`, 400, 'InvalidPacketKey'],
        ['missing packet', `/capture/${captureId}/packets/2`, 404, 'PacketNotFound'],
        ['evicted packet', `/capture/${captureId}/packets/3`, 410, 'PacketEvicted'],
        ['pending detail', `/capture/${captureId}/packets/5`, 425, 'PacketDetailPending'],
        ['corrupt packet', `/capture/${captureId}/packets/6`, 422, 'PacketDataCorrupted'],
    ])('returns the expected response for a %s', async (_name, path, status, error) => {
        const response = await fetch(origin + path)

        expect(response.status).toBe(status)
        expect(await response.json()).toEqual({ error })
    })

    test('rejects methods other than GET', async () => {
        const response = await fetch(`${origin}/capture/${captureId}/packets/1`, {
            method: 'POST',
        })

        expect(response.status).toBe(405)
        expect(response.headers.get('allow')).toBe('GET')
        expect(await response.json()).toEqual({ error: 'MethodNotAllowed' })
    })

    test('cancels packet detail work when the request is aborted', async () => {
        resetCancellation()
        const clientRequest = request(`${origin}/capture/${captureId}/packets/4`)
        clientRequest.on('error', () => undefined)
        clientRequest.end()

        await started
        clientRequest.destroy()

        await cancelled
    })
})

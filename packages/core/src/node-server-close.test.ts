import { createServer, get } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from 'vitest'
import { beginNodeServerClose } from './node-server-close'

test('closes an abandoned streaming response after the drain deadline', async () => {
    const server = createServer((_request, response) => {
        response.writeHead(200)
        response.write('stream remains open')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    const response = await new Promise<import('node:http').IncomingMessage>((resolve, reject) => {
        get(`http://127.0.0.1:${address.port}`, resolve).on('error', reject)
    })
    const disconnected = new Promise<void>((resolve) => response.on('close', resolve))
    try {
        await beginNodeServerClose(server, 25)
        await disconnected
        expect(server.listening).toBe(false)
        expect(response.complete).toBe(false)
    } finally {
        response.destroy()
        server.closeAllConnections()
        server.close()
    }
})

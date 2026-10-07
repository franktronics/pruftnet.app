import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { checkDataDirectory, checkPort } from './doctor'
import type { ServerSettings } from './settings/settings'

let temp: string | undefined
let blocker: Server | undefined

afterEach(async () => {
    if (temp) await rm(temp, { recursive: true, force: true })
    if (blocker) await new Promise((done) => blocker!.close(done))
    temp = undefined
    blocker = undefined
})

function settingsFor(port: number, strictPort: boolean) {
    return {
        host: { value: '127.0.0.1', source: 'default' },
        port: { value: port, source: 'flag' },
        strictPort: { value: strictPort, source: 'flag' },
    } as unknown as ServerSettings
}

async function listenWith(handler: Parameters<typeof createServer>[1]) {
    blocker = createServer(handler)
    await new Promise<void>((done) => blocker!.listen(0, '127.0.0.1', done))
    return (blocker.address() as AddressInfo).port
}

describe('checkDataDirectory', () => {
    test('accepts a missing directory under a writable parent', async () => {
        temp = await mkdtemp(join(tmpdir(), 'pruftnet-doctor-'))
        const result = await Effect.runPromise(checkDataDirectory(join(temp, 'a', 'b')))
        expect(result.status).toBe('ok')
        expect(result.detail).toContain('created on first start')
    })

    test('rejects a file', async () => {
        temp = await mkdtemp(join(tmpdir(), 'pruftnet-doctor-'))
        await writeFile(join(temp, 'file'), '')
        expect((await Effect.runPromise(checkDataDirectory(join(temp, 'file')))).status).toBe(
            'error',
        )
    })

    test('reports a live instance lock', async () => {
        temp = await mkdtemp(join(tmpdir(), 'pruftnet-doctor-'))
        await mkdir(join(temp, 'locks'))
        await writeFile(
            join(temp, 'locks', 'instance.lock'),
            JSON.stringify({ pid: process.pid, startedAtMs: 1 }),
        )
        const result = await Effect.runPromise(checkDataDirectory(temp))
        expect(result.detail).toContain(`in use by running process ${process.pid}`)
    })

    test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
        'rejects a read-only directory',
        async () => {
            temp = await mkdtemp(join(tmpdir(), 'pruftnet-doctor-'))
            await chmod(temp, 0o500)
            const result = await Effect.runPromise(checkDataDirectory(temp))
            await chmod(temp, 0o700)
            expect(result.status).toBe('error')
        },
    )
})

describe('checkPort', () => {
    test('recognizes a running Pruftnet server', async () => {
        const port = await listenWith((_, response) => {
            response.end(JSON.stringify({ status: 'ok', name: 'Pruftnet', version: '9.9.9' }))
        })
        const result = await Effect.runPromise(checkPort(settingsFor(port, true)))
        expect(result).toMatchObject({ status: 'warning' })
        expect(result.detail).toContain('Pruftnet 9.9.9')
    })

    test('fails in strict mode when another program owns the port', async () => {
        const port = await listenWith((_, response) => response.end('not pruftnet'))
        expect((await Effect.runPromise(checkPort(settingsFor(port, true)))).status).toBe('error')
        expect((await Effect.runPromise(checkPort(settingsFor(port, false)))).status).toBe(
            'warning',
        )
    })
})

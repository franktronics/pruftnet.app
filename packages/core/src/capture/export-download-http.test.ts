import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect, Layer } from 'effect'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { makeExportDownloadNodeHandler } from './export-download-http'
import { ExportArtifactRepository, type ExportArtifactRepositoryService } from './export-repository'

const captureId = '00000000000000000000000000000001'
const bytes = Buffer.from('pruftnet-export-download-fixture')
const checksum = createHash('sha256').update(bytes).digest('hex')
let root: string
let artifactPath: string
let origin: string
const server = createServer()

const artifact = {
    captureId,
    format: 'pcapng' as const,
    sourceFingerprint: 'fixture',
    artifactPath: '',
    retainedPortionOnly: false,
    checksumSha256: checksum,
    finalSize: String(bytes.length),
}

describe('makeExportDownloadNodeHandler', () => {
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'pruftnet-download-'))
        artifactPath = join(root, 'artifact.pcapng')
        await writeFile(artifactPath, bytes)
        const repository: ExportArtifactRepositoryService = {
            get: () => Effect.succeed({ ...artifact, artifactPath }),
            put: () => Effect.die('unused'),
            remove: () => Effect.die('unused'),
        }
        const handler = await Effect.runPromise(
            makeExportDownloadNodeHandler.pipe(
                Effect.provide(Layer.succeed(ExportArtifactRepository, repository)),
            ),
        )
        server.on('request', handler)
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterAll(async () => {
        server.closeAllConnections()
        await new Promise<void>((resolve) => server.close(() => resolve()))
        await rm(root, { recursive: true, force: true })
    })

    test('downloads the complete artifact with checksum metadata', async () => {
        const response = await fetch(`${origin}/exports/${captureId}/pcapng/download`)

        expect(response.status).toBe(200)
        expect(response.headers.get('content-length')).toBe(String(bytes.length))
        expect(response.headers.get('x-checksum-sha256')).toBe(checksum)
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
    })

    test('supports HEAD without transferring a body', async () => {
        const response = await fetch(`${origin}/exports/${captureId}/pcapng/download`, {
            method: 'HEAD',
        })

        expect(response.status).toBe(200)
        expect(response.headers.get('content-length')).toBe(String(bytes.length))
        expect(await response.text()).toBe('')
    })

    test('supports resumable byte ranges', async () => {
        const response = await fetch(`${origin}/exports/${captureId}/pcapng/download`, {
            headers: { Range: 'bytes=4-11' },
        })

        expect(response.status).toBe(206)
        expect(response.headers.get('content-range')).toBe(`bytes 4-11/${bytes.length}`)
        expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(4, 12))
    })

    test('rejects an unsatisfiable range', async () => {
        const response = await fetch(`${origin}/exports/${captureId}/pcapng/download`, {
            headers: { Range: 'bytes=999-' },
        })

        expect(response.status).toBe(416)
        expect(response.headers.get('content-range')).toBe(`bytes */${bytes.length}`)
    })
})

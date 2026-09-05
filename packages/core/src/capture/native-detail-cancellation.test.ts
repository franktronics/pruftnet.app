import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

const workerPath = resolve(process.cwd(), 'cpp/build/pruftnet_capture_worker')

function block(type: number, body: Buffer) {
    const output = Buffer.alloc(body.length + 12)
    output.writeUInt32LE(type)
    output.writeUInt32LE(output.length, 4)
    body.copy(output, 8)
    output.writeUInt32LE(output.length, output.length - 4)
    return output
}

function comment(text: string) {
    const output = Buffer.alloc(4 + Math.ceil(text.length / 4) * 4 + 4)
    output.writeUInt16LE(1)
    output.writeUInt16LE(text.length, 2)
    output.write(text, 4)
    return output
}

function captureFile(count: number) {
    const section = Buffer.alloc(16)
    section.writeUInt32LE(0x1a2b3c4d)
    section.writeUInt16LE(1, 4)
    section.writeBigUInt64LE(0xffffffffffffffffn, 8)
    const header = block(
        0x0a0d0d0a,
        Buffer.concat([section, comment('pruftnet.capture_id=00000000000000010000000000000002')]),
    )
    const network = Buffer.alloc(12)
    network.writeUInt16LE(1)
    network.writeUInt32LE(65535, 4)
    const iface = block(1, network)
    const packet = Buffer.alloc(20 + 256)
    packet.writeUInt32LE(256, 12)
    packet.writeUInt32LE(256, 16)
    const template = block(
        6,
        Buffer.concat([packet, comment('pruftnet.packet_id=000000000001;flags=0')]),
    )
    const digits = template.indexOf('000000000001')
    const output = Buffer.alloc(header.length + iface.length + count * template.length)
    header.copy(output)
    iface.copy(output, header.length)
    for (let i = 0; i < count; i += 1) {
        const offset = header.length + iface.length + i * template.length
        template.copy(output, offset)
        output.write(String(i + 1).padStart(12, '0'), offset + digits)
    }
    return output
}

test.runIf(existsSync(workerPath))(
    'native cancellation drains active and queued details without cancelling another request',
    async () => {
        const directory = await realpath(
            await mkdtemp(resolve(tmpdir(), 'pruftnet-native-cancel-')),
        )
        await writeFile(resolve(directory, 'capture.pcapng'), captureFile(200_000))
        const child = spawn(workerPath)
        const pending = new Map<string, (response: Record<string, unknown>) => void>()
        let input = Buffer.alloc(0)
        const observed: string[] = []
        child.stdout.on('data', (chunk: Buffer) => {
            input = Buffer.concat([input, chunk])
            while (input.length >= 4) {
                const length = input.readUInt32LE()
                if (input.length < length + 4) break
                const response = JSON.parse(input.subarray(4, length + 4).toString())
                input = input.subarray(length + 4)
                observed.push(response.id)
                pending.get(response.id)?.(response)
                pending.delete(response.id)
            }
        })
        const send = (command: Record<string, unknown>) => {
            const payload = Buffer.from(JSON.stringify({ v: 2, ...command }))
            const header = Buffer.alloc(4)
            header.writeUInt32LE(payload.length)
            child.stdin.write(Buffer.concat([header, payload]))
        }
        const request = (id: string, command: Record<string, unknown>) =>
            new Promise<Record<string, unknown>>((resolve) => {
                pending.set(id, resolve)
                send({ id, ...command })
            })
        try {
            const registry = await request('registry', { op: 'registry' })
            const command = {
                op: 'detailStored',
                captureHigh: '1',
                captureLow: '2',
                spoolDirectory: directory,
                registryRevision: registry.registryRevision,
                analysisRevision: registry.registryRevision,
                packetId: '200000',
            }
            const active = request('active', command)
            for (let attempt = 0; attempt < 500; attempt += 1) {
                if ((await readdir(directory)).some((name) => name.includes('.tmp-'))) break
                await new Promise((resolve) => setTimeout(resolve, 1))
            }
            const queued = request('queued', command)
            send({ op: 'cancel', target: 'queued' })
            send({ op: 'cancel', target: 'active' })
            // A different client's request remains usable on the shared worker.
            const surviving = request('surviving', { ...command, packetId: '1' })
            expect(await queued).toMatchObject({ ok: false, error: 'cancelled' })
            expect(await active).toMatchObject({ ok: false, error: 'cancelled' })
            expect(await surviving).toMatchObject({ ok: true, format: 'PRT2' })
            expect(observed.filter((id) => id === 'active')).toHaveLength(1)
            expect(observed.filter((id) => id === 'queued')).toHaveLength(1)
            expect(await request('hello', { op: 'hello' })).toMatchObject({ ok: true })
            expect((await readdir(directory)).some((name) => name.includes('.tmp-'))).toBe(false)
        } finally {
            if (child.exitCode === null && child.signalCode === null) {
                const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
                child.kill()
                await exited
            }
            await rm(directory, { recursive: true, force: true })
        }
    },
    15_000,
)

import { execFile as execFileCallback } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

import { Effect } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { ExportEncoder, ExportEncodingError } from './export-encoder'
import type { ExportSourceSegment } from './export-repository'

const roots: Array<string> = []
const execFile = promisify(execFileCallback)

function findExecutable(name: string) {
    const filename = process.platform === 'win32' ? `${name}.exe` : name
    const candidates = [
        ...(process.env.PATH ?? '').split(delimiter).map((directory) => join(directory, filename)),
        join('/Applications/Wireshark.app/Contents/MacOS', filename),
    ]
    return candidates.find(existsSync)
}

const capinfos = findExecutable('capinfos')
const tshark = findExecutable('tshark')

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

function u16(value: number) {
    const bytes = Buffer.alloc(2)
    bytes.writeUInt16LE(value)
    return bytes
}

function u32(value: number) {
    const bytes = Buffer.alloc(4)
    bytes.writeUInt32LE(value)
    return bytes
}

function option(code: number, value = Buffer.alloc(0)) {
    const padding = Buffer.alloc((4 - (value.length % 4)) % 4)
    return Buffer.concat([u16(code), u16(value.length), value, padding])
}

function block(type: number, body: Buffer) {
    const length = body.length + 12
    return Buffer.concat([u32(type), u32(length), body, u32(length)])
}

function section() {
    const length = Buffer.alloc(8, 0xff)
    return block(0x0a0d0d0a, Buffer.concat([u32(0x1a2b3c4d), u16(1), u16(0), length, option(0)]))
}

function interfaceBlock(linkType = 1, resolution = 9) {
    return block(
        1,
        Buffer.concat([
            u16(linkType),
            u16(0),
            u32(65_535),
            option(9, Buffer.from([resolution])),
            option(0),
        ]),
    )
}

function packetBlock(packetId: number, interfaceIndex = 0) {
    const packet = Buffer.from([packetId, 2, 3, 4])
    const timestamp = 1_700_000_000_000_000_000n + BigInt(packetId)
    return block(
        6,
        Buffer.concat([
            u32(interfaceIndex),
            u32(Number(timestamp >> 32n)),
            u32(Number(timestamp & 0xffff_ffffn)),
            u32(packet.length),
            u32(packet.length),
            packet,
            option(0),
        ]),
    )
}

async function fixture(interfaceCount = 1) {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-export-'))
    roots.push(root)
    const headers = Buffer.concat([
        section(),
        ...Array.from({ length: interfaceCount }, () => interfaceBlock()),
    ])
    const paths = [join(root, 'segment-0.pcapng'), join(root, 'segment-1.pcapng')]
    const buffers = [
        Buffer.concat([headers, packetBlock(1)]),
        Buffer.concat([headers, packetBlock(2, interfaceCount - 1)]),
    ]
    await Promise.all(paths.map((path, index) => writeFile(path, buffers[index]!)))
    const segments: ReadonlyArray<ExportSourceSegment> = paths.map((path, ordinal) => ({
        ordinal,
        generation: ordinal,
        path,
        committedBytes: String(buffers[ordinal]!.length),
        committedPackets: '1',
    }))
    return { root, segments }
}

function encode(
    format: 'pcapng' | 'pcap',
    segments: ReadonlyArray<ExportSourceSegment>,
    partialPath: string,
) {
    return ExportEncoder.pipe(
        Effect.flatMap((encoder) =>
            encoder.encode({ format, segments, partialPath, onProgress: () => undefined }),
        ),
        Effect.provide(ExportEncoder.layer),
    )
}

function blockTypes(bytes: Buffer) {
    const types: Array<number> = []
    for (let offset = 0; offset < bytes.length; ) {
        types.push(bytes.readUInt32LE(offset))
        offset += bytes.readUInt32LE(offset + 4)
    }
    return types
}

describe('ExportEncoder', () => {
    test('merges pcapng segments into one canonical section', async () => {
        const { root, segments } = await fixture()
        const output = join(root, 'artifact.partial')
        const result = await Effect.runPromise(encode('pcapng', segments, output))
        const bytes = await readFile(output)

        expect(blockTypes(bytes)).toEqual([0x0a0d0d0a, 1, 6, 6])
        expect(result.packetsWritten).toBe('2')
        expect(result.finalSize).toBe(String(bytes.length))
        expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/)
    })

    test('writes a nanosecond pcap for a single interface', async () => {
        const { root, segments } = await fixture()
        const output = join(root, 'artifact.partial')
        const result = await Effect.runPromise(encode('pcap', segments, output))
        const bytes = await readFile(output)

        expect(bytes.readUInt32LE(0)).toBe(0xa1b23c4d)
        expect(bytes.readUInt32LE(20)).toBe(1)
        expect(result.packetsWritten).toBe('2')
        expect(bytes.length).toBe(64)
    })

    test('rejects classic pcap for multiple interfaces', async () => {
        const { root, segments } = await fixture(2)
        const exit = await Effect.runPromiseExit(
            encode('pcap', segments, join(root, 'artifact.partial')),
        )

        expect(exit._tag).toBe('Failure')
        if (exit._tag === 'Failure') {
            expect(String(exit.cause)).toContain(ExportEncodingError.name)
        }
    })

    test('runs independent exports concurrently', async () => {
        const left = await fixture()
        const right = await fixture()
        const results = await Effect.runPromise(
            Effect.all(
                [
                    encode('pcapng', left.segments, join(left.root, 'left.partial')),
                    encode('pcap', right.segments, join(right.root, 'right.partial')),
                ],
                { concurrency: 'unbounded' },
            ),
        )

        expect(results.map((result) => result.packetsWritten)).toEqual(['2', '2'])
    })

    test.runIf(capinfos && tshark)(
        'produces pcapng and pcap files accepted by Wireshark tools',
        async () => {
            const { root, segments } = await fixture()
            const pcapngPath = join(root, 'artifact.pcapng')
            const pcapPath = join(root, 'artifact.pcap')
            await Effect.runPromise(encode('pcapng', segments, pcapngPath))
            await Effect.runPromise(encode('pcap', segments, pcapPath))

            for (const path of [pcapngPath, pcapPath]) {
                await execFile(capinfos!, [path])
                const { stdout } = await execFile(tshark!, [
                    '-r',
                    path,
                    '-T',
                    'fields',
                    '-e',
                    'frame.number',
                ])
                expect(stdout.trim().split(/\r?\n/)).toEqual(['1', '2'])
            }
        },
    )
})

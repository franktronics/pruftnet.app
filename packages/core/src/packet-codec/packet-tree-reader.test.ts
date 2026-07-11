import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ByteBuffer } from 'flatbuffers'
import { expect, test } from 'vitest'
import { PacketTreeEnvelope } from './generated/pruftnet/wire/packet-tree-envelope.js'
import { PacketTreeReader, PacketTreeReadError, PacketTreeValueTag } from './packet-tree-reader.js'

interface Fixture {
    bytes: Uint8Array
    checksum: bigint
    revision: bigint
}

function fixtureWriter(): string {
    const configured = process.env.PRUFTNET_PACKET_TREE_FIXTURE_WRITER
    const executable =
        process.platform === 'win32'
            ? 'packet_tree_fixture_writer.exe'
            : 'packet_tree_fixture_writer'
    const candidates = [
        configured,
        join('cpp', 'build', executable),
        join('cpp', 'build', 'Debug', executable),
        join('cpp', 'build', 'Release', executable),
        join('cpp', 'build', 'RelWithDebInfo', executable),
    ]
    const writer = candidates.find((candidate) => candidate !== undefined && existsSync(candidate))
    if (writer === undefined) {
        throw new Error('packet_tree_fixture_writer was not found; build its CMake target first')
    }
    return writer
}

function makeFixture(): Fixture {
    const directory = mkdtempSync(join(tmpdir(), 'pruftnet-packet-tree-'))
    const path = join(directory, 'fixture.bin')
    const output = execFileSync(fixtureWriter(), [path], {
        cwd: new URL('../..', import.meta.url),
        encoding: 'utf8',
    })
    const values = new Map(
        output
            .trim()
            .split('\n')
            .map((line) => {
                const [key, value] = line.split('=', 2)
                return [key, BigInt(value ?? '')]
            }),
    )
    return {
        bytes: new Uint8Array(readFileSync(path)),
        checksum: values.get('checksum') ?? 0n,
        revision: values.get('revision') ?? 0n,
    }
}

function fieldValueTags(): ReadonlyMap<number, number> {
    return new Map([
        [1, PacketTreeValueTag.none],
        [2, PacketTreeValueTag.unsigned],
        [3, PacketTreeValueTag.bytes],
        [4, PacketTreeValueTag.generatedText],
    ])
}

function open(fixture: Fixture, bytes: Uint8Array = fixture.bytes): PacketTreeReader {
    return PacketTreeReader.open(bytes, {
        expectedRegistryRevision: fixture.revision,
        fieldValueTags: fieldValueTags(),
    })
}

function expectError(code: PacketTreeReadError['code'], callback: () => unknown): void {
    try {
        callback()
    } catch (error) {
        expect(error).toBeInstanceOf(PacketTreeReadError)
        expect((error as PacketTreeReadError).code).toBe(code)
        return
    }
    throw new Error(`Expected PacketTreeReadError with code ${code}`)
}

const fixture = makeFixture()

test('reads the C++ fixture lazily with checksum parity', () => {
    expect(fixture.revision).toBe(13_891_723_788_706_789_614n)
    const reader = open(fixture)

    expect(reader.registryRevision()).toBe(fixture.revision)
    expect(reader.packetKey()).toEqual({
        captureIdHigh: 0x1020304050607080n,
        captureIdLow: 0x8877665544332211n,
        packetId: 42n,
    })
    expect(reader.nodeCount()).toBe(5)
    expect(reader.dataSourceCount()).toBe(2)
    expect(reader.contributorCount()).toBe(2)
    expect(reader.node(1).fieldId).toBe(reader.node(2).fieldId)
    expect(reader.sourceName(0)).toBe('Captured frame')
    expect(reader.sourceName(1)).toBe('Derived bytes')
    expect([...reader.sourceBytes(1)]).toEqual([0xaa, 0xbb, 0xcc, 0xdd])
    expect([...reader.nodeBytes(3)]).toEqual([0xaa, 0xbb, 0xcc, 0xdd])
    expect(reader.nodeText(4)).toBe('synthetic')
    expect(reader.contributor(1).packetId).toBe(43n)
    expect(reader.checksum()).toBe(fixture.checksum)
})

test('preserves a non-zero Uint8Array offset without copying', () => {
    const storage = new Uint8Array(fixture.bytes.byteLength + 19)
    storage.set(fixture.bytes, 11)
    const input = storage.subarray(11, 11 + fixture.bytes.byteLength)
    const reader = open(fixture, input)

    expect(reader.sourceBytes(1).buffer).toBe(storage.buffer)
    expect(reader.checksum()).toBe(fixture.checksum)
})

test('rejects truncation, incompatible registries, and resource limits', () => {
    expectError('truncated', () =>
        open(fixture, fixture.bytes.subarray(0, fixture.bytes.byteLength - 1)),
    )
    expectError('registry-revision-mismatch', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: fixture.revision + 1n,
            fieldValueTags: fieldValueTags(),
        }),
    )
    expectError('message-too-large', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: fixture.revision,
            fieldValueTags: fieldValueTags(),
            maxMessageBytes: fixture.bytes.byteLength - 1,
        }),
    )
    expectError('resource-limit', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: fixture.revision,
            fieldValueTags: fieldValueTags(),
            maxNodes: 4,
        }),
    )
    expectError('unknown-field', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: fixture.revision,
            fieldValueTags: new Map([[1, PacketTreeValueTag.none]]),
        }),
    )
})

test('rejects structurally valid trees with invalid semantic indexes', () => {
    const corrupted = fixture.bytes.slice()
    const byteBuffer = new ByteBuffer(corrupted)
    const tree = PacketTreeEnvelope.getRootAsPacketTreeEnvelope(byteBuffer).packetTree()
    expect(tree).not.toBeNull()
    const node = tree?.nodes(1)
    expect(node).not.toBeNull()
    const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength)
    view.setUint32(node!.bb_pos + 20, 0xffff_ffff, true)

    expectError('invalid-parent', () => open(fixture, corrupted))

    const invalidScalar = fixture.bytes.slice()
    const scalarBuffer = new ByteBuffer(invalidScalar)
    const scalarNode = PacketTreeEnvelope.getRootAsPacketTreeEnvelope(scalarBuffer)
        .packetTree()
        ?.nodes(1)
    expect(scalarNode).not.toBeNull()
    const scalarView = new DataView(
        invalidScalar.buffer,
        invalidScalar.byteOffset,
        invalidScalar.byteLength,
    )
    scalarView.setBigUint64(scalarNode!.bb_pos + 8, 1n, true)
    expectError('invalid-field-value', () => open(fixture, invalidScalar))

    const orphanContributor = fixture.bytes.slice()
    const contributorBuffer = new ByteBuffer(orphanContributor)
    const derivedSource = PacketTreeEnvelope.getRootAsPacketTreeEnvelope(contributorBuffer)
        .packetTree()
        ?.dataSources(1)
    expect(derivedSource).not.toBeNull()
    const contributorView = new DataView(
        orphanContributor.buffer,
        orphanContributor.byteOffset,
        orphanContributor.byteLength,
    )
    contributorView.setUint32(derivedSource!.bb_pos + 24, 1, true)
    expectError('invalid-range', () => open(fixture, orphanContributor))
})

test('rejects a wrong file identifier before generated accessors run', () => {
    const corrupted = fixture.bytes.slice()
    corrupted[4] ^= 1
    expectError('wrong-identifier', () => open(fixture, corrupted))
})

test('rejects unsafe caller-provided limits', () => {
    expectError('resource-limit', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: fixture.revision,
            fieldValueTags: fieldValueTags(),
            maxNodes: Number.NaN,
        }),
    )
    expectError('resource-limit', () =>
        PacketTreeReader.open(fixture.bytes, {
            expectedRegistryRevision: 0n,
            fieldValueTags: fieldValueTags(),
        }),
    )
})

test('rejects SharedArrayBuffer views that can mutate concurrently', () => {
    const shared = new SharedArrayBuffer(fixture.bytes.byteLength)
    const input = new Uint8Array(shared)
    input.set(fixture.bytes)
    expectError('shared-buffer', () => open(fixture, input))
})

test('never exposes unchecked generated-accessor failures for mutated input', () => {
    let state = 0x9e37_79b9
    for (let iteration = 0; iteration < 1_000; iteration += 1) {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
        const corrupted = fixture.bytes.slice()
        const index = state % corrupted.byteLength
        corrupted[index] ^= state >>> 24 || 1
        try {
            open(fixture, corrupted)
        } catch (error) {
            expect(error).toBeInstanceOf(PacketTreeReadError)
        }
    }
})

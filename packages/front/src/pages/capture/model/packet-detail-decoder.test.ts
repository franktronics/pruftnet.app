import {
    PacketTreeValueTag,
    PacketTreeReader,
    packetTreeReadRegistry,
    type PacketTreeReader as PacketTreeReaderType,
} from '@repo/packet-codec'
import type { RegistrySnapshot } from '@repo/shared/capture'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decodePacketDetail, PacketDetailDecodedKeyError } from './packet-detail-decoder'

vi.mock('@repo/packet-codec', async (loadOriginal) => {
    const original = await loadOriginal<typeof import('@repo/packet-codec')>()
    return {
        ...original,
        PacketTreeReader: { open: vi.fn() },
        packetTreeReadRegistry: vi.fn(original.packetTreeReadRegistry),
    }
})

const registry = {
    registryRevision: '9',
    protocols: [],
    fields: [
        {
            id: 1,
            protocolId: 1,
            key: 'frame',
            displayName: 'Frame',
            valueType: 'protocol',
            visibilityFlags: 0,
        },
    ],
} as RegistrySnapshot

function reader(): PacketTreeReaderType {
    return {
        packetKey: () => ({ captureIdHigh: 1n, captureIdLow: 2n, packetId: 42n }),
        condition: () => 0,
        nodeCount: () => 1,
        node: () => ({
            fieldId: 1,
            parentIndex: 0xffff_ffff,
            dataSourceId: 0,
            offset: 0,
            length: 1,
            flags: 0,
            valueTag: PacketTreeValueTag.none,
            valueLow: 0n,
            valueHigh: 0n,
            valueOffset: 0,
            valueLength: 0,
        }),
        dataSourceCount: () => 1,
        dataSource: () => ({ id: 0 }),
        sourceName: () => 'Captured frame',
        sourceBytes: () => new Uint8Array([1]),
    } as unknown as PacketTreeReaderType
}

describe('decodePacketDetail', () => {
    beforeEach(() => vi.mocked(PacketTreeReader.open).mockReturnValue(reader()))

    it('opens with the exact registry and validates the expected packet key', () => {
        const bytes = new ArrayBuffer(8)
        const model = decodePacketDetail({
            bytes,
            registry,
            expectedCaptureId: '00000000000000010000000000000002',
            expectedPacketId: '42',
        })

        expect(packetTreeReadRegistry).toHaveBeenCalledWith(registry)
        expect(PacketTreeReader.open).toHaveBeenCalledWith(bytes, {
            expectedRegistryRevision: 9n,
            fieldValueTags: new Map([[1, PacketTreeValueTag.none]]),
        })
        expect(model.packetKey.packetId).toBe('42')
    })

    it('rejects a payload for a stale packet selection', () => {
        expect(() =>
            decodePacketDetail({
                bytes: new ArrayBuffer(8),
                registry,
                expectedCaptureId: '00000000000000010000000000000002',
                expectedPacketId: '43',
            }),
        ).toThrow(PacketDetailDecodedKeyError)
    })
})

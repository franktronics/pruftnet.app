import { PacketTreeValueTag, type PacketTreeReader } from '@repo/packet-codec'
import { describe, expect, it } from 'vitest'

import { packetDetailModel } from './packet-detail'

describe('packetDetailModel', () => {
    it('creates cloneable nodes and owned captured and derived sources', () => {
        const sourceBuffers = [new Uint8Array([1, 2]), new Uint8Array([0xaa, 0xbb])]
        const reader = {
            packetKey: () => ({ captureIdHigh: 1n, captureIdLow: 2n, packetId: 42n }),
            condition: () => 3,
            nodeCount: () => 2,
            node: (index: number) =>
                index === 0
                    ? {
                          fieldId: 1,
                          parentIndex: 0xffff_ffff,
                          dataSourceId: 0,
                          offset: 0,
                          length: 2,
                          flags: 1,
                          valueTag: PacketTreeValueTag.unsigned,
                          valueLow: 7n,
                          valueHigh: 0n,
                      }
                    : {
                          fieldId: 2,
                          parentIndex: 0,
                          dataSourceId: 1,
                          offset: 0,
                          length: 2,
                          flags: 1,
                          valueTag: PacketTreeValueTag.bytes,
                          valueLow: 0n,
                          valueHigh: 0n,
                      },
            nodeBytes: () => sourceBuffers[1],
            dataSourceCount: () => 2,
            dataSource: (index: number) => ({ id: index }),
            sourceName: (index: number) => (index === 0 ? 'Captured frame' : 'Derived bytes'),
            sourceBytes: (index: number) => sourceBuffers[index],
        } as unknown as PacketTreeReader

        const model = packetDetailModel(reader)
        expect(model.packetKey).toEqual({
            captureId: '00000000000000010000000000000002',
            packetId: '42',
        })
        expect(model.nodes.map((node) => node.value)).toEqual(['7', 'aa bb'])
        expect(model.sources.map((source) => [source.id, source.name, [...source.bytes]])).toEqual([
            [0, 'Captured frame', [1, 2]],
            [1, 'Derived bytes', [0xaa, 0xbb]],
        ])
        expect(model.sources[1]!.bytes.buffer).not.toBe(sourceBuffers[1]!.buffer)
        expect(structuredClone(model)).toEqual(model)
    })
})

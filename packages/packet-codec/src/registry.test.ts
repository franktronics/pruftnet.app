import { expect, test } from 'vitest'
import { PacketTreeValueTag } from './packet-tree-reader.js'
import { packetTreeReadRegistry, packetTreeValueTag } from './registry.js'

test('maps registry field value types to wire tags', () => {
    expect(packetTreeValueTag('protocol')).toBe(PacketTreeValueTag.none)
    expect(packetTreeValueTag('generatedText')).toBe(PacketTreeValueTag.generatedText)

    expect(
        packetTreeReadRegistry({
            registryRevision: '42',
            fields: [
                { id: 1, valueType: 'protocol' },
                { id: 2, valueType: 'bytes' },
            ],
        }),
    ).toEqual({
        expectedRegistryRevision: 42n,
        fieldValueTags: new Map([
            [1, PacketTreeValueTag.none],
            [2, PacketTreeValueTag.bytes],
        ]),
    })
})

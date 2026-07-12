import { PacketTreeValueTag } from './packet-tree-reader.js'

export type PacketTreeFieldValueType =
    | 'protocol'
    | 'unsigned'
    | 'signed'
    | 'boolean'
    | 'bytes'
    | 'string'
    | 'generatedText'

export interface PacketTreeRegistryField {
    readonly id: number
    readonly valueType: PacketTreeFieldValueType
}

export interface PacketTreeRegistry {
    readonly registryRevision: string
    readonly fields: ReadonlyArray<PacketTreeRegistryField>
}

export function packetTreeValueTag(valueType: PacketTreeFieldValueType): number {
    return valueType === 'protocol' ? PacketTreeValueTag.none : PacketTreeValueTag[valueType]
}

export function packetTreeFieldValueTags(
    fields: ReadonlyArray<PacketTreeRegistryField>,
): ReadonlyMap<number, number> {
    return new Map(fields.map((field) => [field.id, packetTreeValueTag(field.valueType)]))
}

export function packetTreeReadRegistry(registry: PacketTreeRegistry): {
    expectedRegistryRevision: bigint
    fieldValueTags: ReadonlyMap<number, number>
} {
    return {
        expectedRegistryRevision: BigInt(registry.registryRevision),
        fieldValueTags: packetTreeFieldValueTags(registry.fields),
    }
}

import { PacketTreeValueTag, type PacketTreeReader } from '@repo/packet-codec'
import type { RegistrySnapshot } from '@repo/shared/capture'

export interface PacketDetailNode {
    readonly fieldId: number
    readonly parentIndex: number
    readonly dataSourceId: number
    readonly offset: number
    readonly length: number
    readonly flags: number
    readonly value: string
}

export interface PacketDetailSource {
    readonly id: number
    readonly name: string
    readonly bytes: Uint8Array
}

export interface PacketDetailModel {
    readonly packetKey: { readonly captureId: string; readonly packetId: string }
    readonly condition: number
    readonly nodes: readonly PacketDetailNode[]
    readonly sources: readonly PacketDetailSource[]
}

export interface PacketDetailView {
    readonly nodes: readonly PacketDetailNode[]
    readonly sources: readonly PacketDetailSource[]
}

export interface PacketDetailDecodeRequest {
    readonly bytes: ArrayBuffer
    readonly registry: RegistrySnapshot
    readonly expectedCaptureId: string
    readonly expectedPacketId: string
}

export type PacketDetailWorkerResponse =
    | { readonly kind: 'success'; readonly model: PacketDetailModel }
    | { readonly kind: 'error'; readonly error: PacketDetailDecodeError }

export interface PacketDetailDecodeError {
    readonly kind: 'invalid' | 'key'
    readonly message: string
}

function formatNodeValue(reader: PacketTreeReader, index: number): string {
    const node = reader.node(index)
    if (node.valueTag === PacketTreeValueTag.none) return ''
    if (
        node.valueTag === PacketTreeValueTag.string ||
        node.valueTag === PacketTreeValueTag.generatedText
    )
        return reader.nodeText(index)
    if (node.valueTag === PacketTreeValueTag.bytes)
        return Array.from(reader.nodeBytes(index).subarray(0, 16), (byte) =>
            byte.toString(16).padStart(2, '0'),
        ).join(' ')
    if (node.valueTag === PacketTreeValueTag.boolean) return node.valueLow === 0n ? 'false' : 'true'
    if (node.valueTag === PacketTreeValueTag.signed)
        return BigInt.asIntN(64, node.valueLow).toString()
    if (node.valueTag === PacketTreeValueTag.unsigned)
        return node.valueHigh === 0n
            ? node.valueLow.toString()
            : `0x${node.valueHigh.toString(16)}${node.valueLow.toString(16).padStart(16, '0')}`
    return ''
}

export function packetDetailModel(reader: PacketTreeReader): PacketDetailModel {
    const key = reader.packetKey()
    const captureId = `${key.captureIdHigh.toString(16).padStart(16, '0')}${key.captureIdLow.toString(16).padStart(16, '0')}`
    const nodes = Array.from({ length: reader.nodeCount() }, (_, index) => {
        const node = reader.node(index)
        return {
            fieldId: node.fieldId,
            parentIndex: node.parentIndex,
            dataSourceId: node.dataSourceId,
            offset: node.offset,
            length: node.length,
            flags: node.flags,
            value: formatNodeValue(reader, index),
        }
    })
    const sources = Array.from({ length: reader.dataSourceCount() }, (_, index) => ({
        id: reader.dataSource(index).id,
        name: reader.sourceName(index),
        bytes: reader.sourceBytes(index).slice(),
    }))
    return {
        packetKey: { captureId, packetId: key.packetId.toString() },
        condition: reader.condition(),
        nodes,
        sources,
    }
}

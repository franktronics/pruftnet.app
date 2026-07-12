import type { PacketSummary, RegistrySnapshot } from '@repo/shared/capture'
import type { PacketDetailView } from './packet-detail'

export const PACKET_ROW_HEIGHT = 38
export const BYTE_ROW_WIDTH = 16
export const NO_PARENT = 0xffff_ffff

export interface TreeRow {
    readonly index: number
    readonly depth: number
    readonly hasChildren: boolean
}

export interface ByteRange {
    readonly sourceId: number
    readonly start: number
    readonly end: number
}

export function packetKey(summary: PacketSummary): string {
    return `${summary.key.captureId}:${summary.key.packetId}`
}

export function summaryColumn(summary: PacketSummary, key: string): string {
    return summary.columns.find((column) => column.key === key)?.value ?? '—'
}

export function relativePacketTime(timestampNs: string, firstTimestampNs: string): string {
    const delta = BigInt(timestampNs) - BigInt(firstTimestampNs)
    const safeDelta = delta < 0n ? 0n : delta
    const seconds = safeDelta / 1_000_000_000n
    const fraction = (safeDelta % 1_000_000_000n).toString().padStart(9, '0').slice(0, 6)
    return `${seconds}.${fraction}`
}

export function deepestNodeAtByte(
    detail: PacketDetailView,
    sourceId: number,
    offset: number,
): number | undefined {
    let match: { index: number; depth: number; length: number } | undefined
    const depths: number[] = []
    for (let index = 0; index < detail.nodes.length; index += 1) {
        const node = detail.nodes[index]!
        const depth = node.parentIndex === NO_PARENT ? 0 : (depths[node.parentIndex] ?? -1) + 1
        depths[index] = depth
        if (
            node.dataSourceId !== sourceId ||
            node.length <= 0 ||
            offset < node.offset ||
            offset >= node.offset + node.length
        )
            continue
        if (!match || depth > match.depth || (depth === match.depth && node.length < match.length))
            match = { index, depth, length: node.length }
    }
    return match?.index
}

export function visibleTreeRows(
    detail: PacketDetailView,
    expanded: ReadonlySet<number>,
): TreeRow[] {
    const rows: TreeRow[] = []
    const depths: number[] = []
    const visible: boolean[] = []
    const children = new Set<number>()
    for (let index = 1; index < detail.nodes.length; index += 1)
        children.add(detail.nodes[index]!.parentIndex)
    for (let index = 0; index < detail.nodes.length; index += 1) {
        const parent = detail.nodes[index]!.parentIndex
        const depth = parent === NO_PARENT ? 0 : (depths[parent] ?? -1) + 1
        depths[index] = depth
        visible[index] = parent === NO_PARENT || (visible[parent] === true && expanded.has(parent))
        if (visible[index]) rows.push({ index, depth, hasChildren: children.has(index) })
    }
    return rows
}

export function nodeRange(detail: PacketDetailView, index: number): ByteRange {
    const node = detail.nodes[index]!
    return { sourceId: node.dataSourceId, start: node.offset, end: node.offset + node.length }
}

export function fieldLabel(registry: RegistrySnapshot, fieldId: number): string {
    const field = registry.fields.find((candidate) => candidate.id === fieldId)
    return field?.displayName ?? field?.key ?? `Field ${fieldId}`
}

export function formatCount(value: string | bigint): string {
    return BigInt(value).toLocaleString()
}

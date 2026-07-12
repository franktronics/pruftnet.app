import { describe, expect, it } from 'vitest'
import type { PacketDetailView } from './packet-detail'

import { deepestNodeAtByte, NO_PARENT, relativePacketTime, visibleTreeRows } from './packet-view'

describe('visibleTreeRows', () => {
    it('uses parent indexes and preserves repeated sibling nodes', () => {
        const nodes = [
            { parentIndex: NO_PARENT },
            { parentIndex: 0 },
            { parentIndex: 1 },
            { parentIndex: 0 },
        ]
        const detail = { nodes, sources: [] } as unknown as PacketDetailView

        expect(visibleTreeRows(detail, new Set([0]))).toEqual([
            { index: 0, depth: 0, hasChildren: true },
            { index: 1, depth: 1, hasChildren: true },
            { index: 3, depth: 1, hasChildren: false },
        ])
        expect(visibleTreeRows(detail, new Set([0, 1])).map((row) => row.index)).toEqual([
            0, 1, 2, 3,
        ])
    })
})

describe('deepestNodeAtByte', () => {
    it('returns the deepest source-backed node containing the byte', () => {
        const nodes = [
            { parentIndex: NO_PARENT, dataSourceId: 0, offset: 0, length: 64 },
            { parentIndex: 0, dataSourceId: 0, offset: 12, length: 20 },
            { parentIndex: 1, dataSourceId: 0, offset: 16, length: 4 },
            { parentIndex: 2, dataSourceId: 1, offset: 16, length: 4 },
        ]
        const detail = { nodes, sources: [] } as unknown as PacketDetailView
        expect(deepestNodeAtByte(detail, 0, 17)).toBe(2)
        expect(deepestNodeAtByte(detail, 0, 64)).toBeUndefined()
        expect(deepestNodeAtByte(detail, 1, 17)).toBe(3)
    })
})

describe('relativePacketTime', () => {
    it('formats nanosecond deltas with stable microsecond precision', () => {
        expect(relativePacketTime('2500000123', '1000000000')).toBe('1.500000')
        expect(relativePacketTime('999', '1000')).toBe('0.000000')
    })
})

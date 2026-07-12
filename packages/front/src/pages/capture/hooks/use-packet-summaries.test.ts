import type { PacketSummaryBatch } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import { emptySummaryState, mergeSummaryBatch } from './use-packet-summaries'

const captureId = '0123456789abcdef0123456789abcdef'

function batch(cursors: string[], overrides: Partial<PacketSummaryBatch> = {}): PacketSummaryBatch {
    return {
        captureId,
        firstCursor: cursors[0] ?? null,
        lastCursor: cursors.at(-1) ?? null,
        oldestAvailableCursor: cursors[0] ?? null,
        newestAvailableCursor: cursors.at(-1) ?? null,
        gapBeforeFirst: false,
        captureComplete: false,
        summaries: cursors.map(
            (cursor) =>
                ({
                    cursor,
                    timestampNs: `${Number(cursor) * 1000}`,
                    key: { captureId, packetId: cursor },
                }) as never,
        ),
        ...overrides,
    } as PacketSummaryBatch
}

describe('mergeSummaryBatch', () => {
    test('deduplicates an ordered overlap and trims the front with a gap marker', () => {
        const first = mergeSummaryBatch(captureId, emptySummaryState, batch(['1', '2']))
        const result = mergeSummaryBatch(captureId, first, batch(['2', '3']), 2)
        expect(result.rows.map((row) => (row.kind === 'gap' ? 'gap' : row.summary.cursor))).toEqual(
            ['gap', '2', '3'],
        )
    })

    test('appends a non-overlapping batch without adding a gap', () => {
        const first = mergeSummaryBatch(captureId, emptySummaryState, batch(['1', '2']))
        const result = mergeSummaryBatch(captureId, first, batch(['3', '4']))
        expect(
            result.rows.map((row) => (row.kind === 'packet' ? row.summary.cursor : 'gap')),
        ).toEqual(['1', '2', '3', '4'])
    })

    test('retains the first timestamp as the stable time origin after trimming', () => {
        const first = mergeSummaryBatch(captureId, emptySummaryState, batch(['1', '2']))
        const result = mergeSummaryBatch(captureId, first, batch(['3']), 2)
        expect(result.originTimestampNs).toBe('1000')
        expect(
            result.rows.map((row) => (row.kind === 'packet' ? row.summary.cursor : 'gap')),
        ).toEqual(['gap', '2', '3'])
    })

    test('rejects a batch from another capture', () => {
        const state = mergeSummaryBatch(captureId, emptySummaryState, batch(['1']))
        expect(
            mergeSummaryBatch(captureId, state, batch(['2'], { captureId: 'f'.repeat(32) })),
        ).toBe(state)
    })

    test('retains cursor and gap state across an empty cache merge', () => {
        const state = mergeSummaryBatch(
            captureId,
            emptySummaryState,
            batch(['4'], { gapBeforeFirst: true }),
        )
        const result = mergeSummaryBatch(
            captureId,
            state,
            batch([], { oldestAvailableCursor: '4' }),
        )
        expect(result.cursor).toBe('4')
        expect(result.rows.map((row) => row.kind)).toEqual(['gap', 'packet'])
    })
})

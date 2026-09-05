import type { PacketSummaryBatch } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import {
    emptySummaryState,
    mergeSummaryBatch,
    PACKET_SUMMARY_PAGE_SIZE,
    packetSummaryPageStarts,
    readPacketSummaryState,
} from './use-packet-summaries'

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

describe('readPacketSummaryState', () => {
    test('loads only the first page for retained history', async () => {
        const firstPage = Array.from({ length: PACKET_SUMMARY_PAGE_SIZE }, (_, index) =>
            String(index + 1),
        )
        let reads = 0
        const result = await readPacketSummaryState(
            captureId,
            emptySummaryState,
            'history',
            async () => {
                reads++
                return batch(firstPage)
            },
            new AbortController().signal,
        )

        expect(reads).toBe(1)
        expect(result.rows).toHaveLength(PACKET_SUMMARY_PAGE_SIZE)
        expect(result.complete).toBe(false)
    })

    test('publishes a full live page without waiting for the moving tail', async () => {
        const firstPage = Array.from({ length: PACKET_SUMMARY_PAGE_SIZE }, (_, index) =>
            String(index + 1),
        )
        const secondPage = [String(PACKET_SUMMARY_PAGE_SIZE + 1)]
        const pages = [batch(firstPage), batch(secondPage)]
        let reads = 0
        const result = await readPacketSummaryState(
            captureId,
            emptySummaryState,
            'live',
            async () => pages[reads++]!,
            new AbortController().signal,
        )

        expect(reads).toBe(1)
        expect(result.rows).toHaveLength(PACKET_SUMMARY_PAGE_SIZE)
        expect(result.cursor).toBe(firstPage.at(-1))
    })

    test('rejects a full live page that does not advance the cursor', async () => {
        const cursors = Array.from({ length: PACKET_SUMMARY_PAGE_SIZE }, () => '1')
        await expect(
            readPacketSummaryState(
                captureId,
                mergeSummaryBatch(captureId, emptySummaryState, batch(['1'])),
                'live',
                async () => batch(cursors),
                new AbortController().signal,
            ),
        ).rejects.toThrow('Packet summary cursor did not advance')
    })
})

describe('packetSummaryPageStarts', () => {
    test('requests a deep visible range directly with adjacent prefetch pages', () => {
        expect(packetSummaryPageStarts(149_000, 149_020, 149_742)).toEqual([
            581 * PACKET_SUMMARY_PAGE_SIZE,
            582 * PACKET_SUMMARY_PAGE_SIZE,
            583 * PACKET_SUMMARY_PAGE_SIZE,
        ])
    })

    test('clamps prefetch at the beginning and end of a capture', () => {
        expect(packetSummaryPageStarts(0, 20, 1_500)).toEqual([0, PACKET_SUMMARY_PAGE_SIZE])
        expect(packetSummaryPageStarts(1_490, 1_499, 1_500)).toEqual([
            4 * PACKET_SUMMARY_PAGE_SIZE,
            5 * PACKET_SUMMARY_PAGE_SIZE,
        ])
        expect(packetSummaryPageStarts(0, 0, 0)).toEqual([])
    })
})

import { describe, expect, test } from 'vitest'
import { MAX_PACKET_SCROLL_HEIGHT, packetViewport } from './packet-viewport'
import { PACKET_ROW_HEIGHT } from './packet-view'

describe('packet viewport', () => {
    test('allocates only visible rows even for ten million packets', () => {
        const viewport = packetViewport(10_000_000, 680, 8_000_000)
        expect(viewport.items.length).toBeLessThanOrEqual(45)
        expect(viewport.totalSize).toBe(MAX_PACKET_SCROLL_HEIGHT)
        const firstVisible = viewport.items.find((row) => row.start >= 8_000_000)!
        expect(firstVisible.start - 8_000_000).toBeLessThan(PACKET_ROW_HEIGHT)
    })
    test('reaches the exact final packet through the compressed scrollbar', () => {
        const count = 10_000_000
        const height = 680
        const viewport = packetViewport(count, height, MAX_PACKET_SCROLL_HEIGHT - height)
        expect(viewport.items.at(-1)?.index).toBe(count - 1)
        expect(viewport.items.at(-1)!.start + PACKET_ROW_HEIGHT).toBeCloseTo(
            MAX_PACKET_SCROLL_HEIGHT,
        )
    })
    test('preserves ordinary pixel scrolling and clamps empty captures', () => {
        expect(packetViewport(100, 340, 680).scale).toBe(1)
        expect(packetViewport(100, 340, 680).items[0]?.start).toBe(8 * PACKET_ROW_HEIGHT)
        expect(packetViewport(0, 340, 680).items).toEqual([])
    })
})

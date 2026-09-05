import type { PacketSummary } from '@repo/shared/capture'
import { expect, test } from 'vitest'
import { SummaryDeliveryCache } from './summary-delivery-cache'

function rows(...cursors: number[]) {
    return cursors.map(
        (cursor) =>
            ({ cursor: String(cursor), columns: [], protocolPath: [] }) as unknown as PacketSummary,
    )
}

test('serves ordered persisted pages and requires storage for evicted or unrelated cursors', () => {
    const cache = new SummaryDeliveryCache()
    cache.append('a', rows(4, 5))
    cache.append('a', rows(6, 7))
    expect(cache.read('a', '3', 3)?.map((row) => row.cursor)).toEqual(['4', '5', '6'])
    expect(cache.read('a', '5', 3)?.map((row) => row.cursor)).toEqual(['6', '7'])
    expect(cache.read('a', '0', 3)).toBeUndefined()
    expect(cache.read('b', '3', 3)).toBeUndefined()
    for (let index = 8; index < 50; index++) cache.append('a', rows(index))
    expect(cache.read('a', '5', 3)).toBeUndefined()
})

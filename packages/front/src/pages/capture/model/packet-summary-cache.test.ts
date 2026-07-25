import { describe, expect, test, vi } from 'vitest'

import { PacketSummaryPageCache } from './packet-summary-cache'

function page(id: string, bytes: number, remove = vi.fn()) {
    return {
        id,
        datasetKey: 'capture:revision:filter',
        bytes,
        remove,
        hasData: () => true,
    }
}

describe('PacketSummaryPageCache', () => {
    test('evicts the least recently used unpinned page by byte budget', () => {
        const cache = new PacketSummaryPageCache(20)
        const first = page('first', 10)
        const second = page('second', 10)
        const third = page('third', 10)

        cache.register(first)
        cache.register(second)
        cache.touch('first')
        cache.register(third)

        expect(second.remove).toHaveBeenCalledOnce()
        expect(first.remove).not.toHaveBeenCalled()
        expect(cache.getSnapshot()).toMatchObject({ retainedBytes: 20, retainedPages: 2 })
    })

    test('allows pinned viewport pages to exceed the budget temporarily', () => {
        const cache = new PacketSummaryPageCache(10)
        const first = page('first', 10)
        const second = page('second', 10)

        cache.setPinned('viewport', new Set(['first', 'second']))
        cache.register(first)
        cache.register(second)

        expect(first.remove).not.toHaveBeenCalled()
        expect(second.remove).not.toHaveBeenCalled()
        expect(cache.getSnapshot().retainedBytes).toBe(20)

        cache.releasePins('viewport')
        expect(first.remove).toHaveBeenCalledOnce()
    })

    test('removes accounting for pages deleted outside the cache', () => {
        const cache = new PacketSummaryPageCache(20)
        let retained = true
        cache.register({
            ...page('first', 10),
            hasData: () => retained,
        })

        retained = false
        cache.reconcile()
        expect(cache.getSnapshot()).toMatchObject({ retainedBytes: 0, retainedPages: 0 })
    })
})

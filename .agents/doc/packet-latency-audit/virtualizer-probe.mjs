import { Virtualizer } from '@tanstack/virtual-core'
import { performance } from 'node:perf_hooks'

for (const count of [50_000, 213_741]) {
    const key = (index) => `packet-summary-row-${index}`
    const options = {
        count,
        getScrollElement: () => null,
        estimateSize: () => 34,
        getItemKey: key,
        scrollToFn() {},
        observeElementRect() {},
        observeElementOffset() {},
    }
    const virtualizer = new Virtualizer(options)
    virtualizer.getTotalSize()
    for (const stable of [true, false]) {
        const times = []
        let checksum = 0
        for (let run = 0; run < 110; run++) {
            const start = performance.now()
            virtualizer.setOptions({
                ...options,
                getItemKey: stable ? key : (index) => `packet-summary-row-${index}`,
            })
            checksum += virtualizer.getTotalSize()
            if (run >= 10) times.push(performance.now() - start)
        }
        times.sort((left, right) => left - right)
        console.log(JSON.stringify({
            count,
            stableKey: stable,
            medianMs: Number(times[50].toFixed(3)),
            p95Ms: Number(times[94].toFixed(3)),
            checksum,
        }))
    }
}

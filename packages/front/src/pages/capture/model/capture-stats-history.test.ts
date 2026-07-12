import { describe, expect, it } from 'vitest'
import type { CaptureStats } from '@repo/shared/capture'

import { appendCaptureStatsSample, chartNumber, MAX_STATS_SAMPLES } from './capture-stats-history'

function stats(overrides: Partial<CaptureStats> = {}): CaptureStats {
    return {
        captureId: '00000000000000000000000000000000',
        interfaces: [],
        packetsSeen: '0',
        packetsEnqueued: '0',
        packetsParsed: '0',
        appRingDrops: '0',
        pcapReceived: '0',
        pcapDropped: '0',
        pcapInterfaceDropped: '0',
        retainedPackets: '0',
        retainedBytes: '0',
        retentionEvictions: '0',
        retentionRejected: '0',
        ipcDrops: '0',
        parserThreadRunning: true,
        ...overrides,
    } as CaptureStats
}

describe('capture stats history', () => {
    it('calculates adjacent rates and ring pressure', () => {
        const first = appendCaptureStatsSample(
            [],
            stats({ packetsSeen: '10', packetsParsed: '8' }),
            0,
        )
        const next = appendCaptureStatsSample(
            first,
            stats({
                packetsSeen: '30',
                packetsParsed: '28',
                interfaces: [
                    {
                        interfaceId: 1,
                        interfaceName: 'en0',
                        ringDepth: '3',
                        ringCapacity: '4',
                    } as CaptureStats['interfaces'][number],
                ],
            }),
            2_000,
        )

        expect(next.at(-1)).toMatchObject({ seenRate: 10n, parsedRate: 10n, ringPressure: 75 })
    })

    it('starts a new rate baseline when counters decrease', () => {
        const first = appendCaptureStatsSample([], stats({ packetsSeen: '50' }), 0)
        const next = appendCaptureStatsSample(first, stats({ packetsSeen: '2' }), 1_000)
        expect(next.at(-1)?.seenRate).toBeUndefined()
    })

    it('keeps a bounded two-minute window', () => {
        let history = [] as ReturnType<typeof appendCaptureStatsSample>
        for (let index = 0; index < MAX_STATS_SAMPLES + 5; index += 1)
            history = appendCaptureStatsSample(history, stats({ packetsSeen: `${index}` }), index)
        expect(history).toHaveLength(MAX_STATS_SAMPLES)
        expect(history[0]?.packetsSeen).toBe(5n)
    })

    it('clamps chart-only values without changing exact counters', () => {
        const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 100n
        expect(chartNumber(tooLarge)).toBe(Number.MAX_SAFE_INTEGER)
        expect(chartNumber(undefined)).toBeNull()
    })
})

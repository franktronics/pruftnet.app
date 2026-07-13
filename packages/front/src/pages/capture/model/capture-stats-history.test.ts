import { describe, expect, it } from 'vitest'
import type { CaptureStats } from '@repo/shared/capture'

import { appendCaptureStatsSample, chartNumber, MAX_STATS_SAMPLES } from './capture-stats-history'

function stats(overrides: Partial<CaptureStats> = {}): CaptureStats {
    return {
        captureId: '00000000000000000000000000000000',
        interfaces: [],
        packetsObserved: '0',
        captureQueueAccepted: '0',
        captureQueueFullDrops: '0',
        captureQueueOversizeDrops: '0',
        invalidCallbackDrops: '0',
        pcapDispatchCalls: '0',
        pcapDispatchErrors: '0',
        pcapStatsReadFailures: '0',
        pcapReceived: '0',
        pcapKernelDrops: '0',
        pcapInterfaceDrops: '0',
        captureQueueDepth: '0',
        captureQueueCapacityPackets: '0',
        captureQueueCapacityBytes: '0',
        captureQueueBytes: '0',
        captureQueueMaxDepth: '0',
        captureQueueMaxBytes: '0',
        packetsPersisted: '0',
        spoolBytesWritten: '0',
        spoolWriteRate: '0',
        spoolSegments: '0',
        spoolQuotaBytes: '0',
        spoolBytesRetained: '0',
        spoolEvictedPackets: '0',
        spoolEvictedBytes: '0',
        spoolWriteFailures: '0',
        spoolFlushFailures: '0',
        lastCommittedPacketId: '0',
        writerInFlight: '0',
        terminalWriteLosses: '0',
        packetsAvailableForAnalysis: '0',
        packetsAnalyzed: '0',
        analysisBacklogPackets: '0',
        analysisBacklogBytes: '0',
        analysisErrors: '0',
        analysisResourceLimits: '0',
        summaryCount: '0',
        summaryOldestCursor: null,
        summaryNewestCursor: null,
        analysisGapCount: '0',
        analysisEvictedBeforeAnalysis: '0',
        analysisRejects: '0',
        writerRunning: true,
        analyzerRunning: true,
        ...overrides,
    } as CaptureStats
}

describe('capture stats history', () => {
    it('calculates adjacent rates and ring pressure', () => {
        const first = appendCaptureStatsSample(
            [],
            stats({ packetsObserved: '10', packetsPersisted: '8', packetsAnalyzed: '8' }),
            0,
        )
        const next = appendCaptureStatsSample(
            first,
            stats({
                packetsObserved: '30',
                packetsPersisted: '28',
                packetsAnalyzed: '28',
                interfaces: [
                    {
                        interfaceId: 1,
                        interfaceName: 'en0',
                        captureQueueDepth: '3',
                        captureQueueCapacityPackets: '4',
                        captureQueueBytes: '30',
                        captureQueueCapacityBytes: '100',
                    } as unknown as CaptureStats['interfaces'][number],
                ],
            }),
            2_000,
        )

        expect(next.at(-1)).toMatchObject({
            observedRate: 10n,
            persistedRate: 10n,
            analyzedRate: 10n,
            captureQueuePressure: 75,
        })
    })

    it('starts a new rate baseline when counters decrease', () => {
        const first = appendCaptureStatsSample([], stats({ packetsObserved: '50' }), 0)
        const next = appendCaptureStatsSample(first, stats({ packetsObserved: '2' }), 1_000)
        expect(next.at(-1)?.observedRate).toBeUndefined()
    })

    it('keeps a bounded two-minute window', () => {
        let history = [] as ReturnType<typeof appendCaptureStatsSample>
        for (let index = 0; index < MAX_STATS_SAMPLES + 5; index += 1)
            history = appendCaptureStatsSample(
                history,
                stats({ packetsObserved: `${index}` }),
                index,
            )
        expect(history).toHaveLength(MAX_STATS_SAMPLES)
        expect(history[0]?.packetsObserved).toBe(5n)
    })

    it('clamps chart-only values without changing exact counters', () => {
        const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 100n
        expect(chartNumber(tooLarge)).toBe(Number.MAX_SAFE_INTEGER)
        expect(chartNumber(undefined)).toBeNull()
    })
})

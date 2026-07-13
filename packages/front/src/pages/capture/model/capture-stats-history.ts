import type { CaptureStats } from '@repo/shared/capture'

export const MAX_STATS_SAMPLES = 1000

export interface CaptureStatsSample {
    at: number
    packetsObserved: bigint
    packetsPersisted: bigint
    packetsAnalyzed: bigint
    observedRate?: bigint
    persistedRate?: bigint
    analyzedRate?: bigint
    captureQueuePressure: number
}

export function appendCaptureStatsSample(
    history: readonly CaptureStatsSample[],
    stats: CaptureStats,
    at: number,
    limit = MAX_STATS_SAMPLES,
): readonly CaptureStatsSample[] {
    const packetsObserved = BigInt(stats.packetsObserved)
    const packetsPersisted = BigInt(stats.packetsPersisted)
    const packetsAnalyzed = BigInt(stats.packetsAnalyzed)
    const previous = history.at(-1)
    const elapsed = previous ? Math.max(1, Math.round(at - previous.at)) : undefined
    const sample: CaptureStatsSample = {
        at,
        packetsObserved,
        packetsPersisted,
        packetsAnalyzed,
        observedRate:
            previous && elapsed && packetsObserved >= previous.packetsObserved
                ? ((packetsObserved - previous.packetsObserved) * 1000n) / BigInt(elapsed)
                : undefined,
        persistedRate:
            previous && elapsed && packetsPersisted >= previous.packetsPersisted
                ? ((packetsPersisted - previous.packetsPersisted) * 1000n) / BigInt(elapsed)
                : undefined,
        analyzedRate:
            previous && elapsed && packetsAnalyzed >= previous.packetsAnalyzed
                ? ((packetsAnalyzed - previous.packetsAnalyzed) * 1000n) / BigInt(elapsed)
                : undefined,
        captureQueuePressure: maximumCaptureQueuePressure(stats),
    }
    const next = [...history, sample]
    return next.length > limit ? next.slice(-limit) : next
}

export function chartNumber(value: bigint | undefined): number | null {
    if (value === undefined) return null
    const limit = BigInt(Number.MAX_SAFE_INTEGER)
    return Number(value > limit ? limit : value < -limit ? -limit : value)
}

function maximumCaptureQueuePressure(stats: CaptureStats): number {
    let maximumBasisPoints = 0n
    for (const item of stats.interfaces) {
        const capacities = [
            [BigInt(item.captureQueueDepth), BigInt(item.captureQueueCapacityPackets)],
            [BigInt(item.captureQueueBytes), BigInt(item.captureQueueCapacityBytes)],
        ] as const
        for (const [current, capacity] of capacities) {
            if (capacity <= 0n) continue
            const bounded = current < 0n ? 0n : current > capacity ? capacity : current
            const basisPoints = (bounded * 10_000n) / capacity
            if (basisPoints > maximumBasisPoints) maximumBasisPoints = basisPoints
        }
    }
    return Number(maximumBasisPoints) / 100
}

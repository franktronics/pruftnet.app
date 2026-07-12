import type { CaptureStats } from '@repo/shared/capture'

export const MAX_STATS_SAMPLES = 120

export interface CaptureStatsSample {
    at: number
    packetsSeen: bigint
    packetsParsed: bigint
    seenRate?: bigint
    parsedRate?: bigint
    ringPressure: number
}

export function appendCaptureStatsSample(
    history: readonly CaptureStatsSample[],
    stats: CaptureStats,
    at: number,
    limit = MAX_STATS_SAMPLES,
): readonly CaptureStatsSample[] {
    const packetsSeen = BigInt(stats.packetsSeen)
    const packetsParsed = BigInt(stats.packetsParsed)
    const previous = history.at(-1)
    const elapsed = previous ? Math.max(1, Math.round(at - previous.at)) : undefined
    const sample: CaptureStatsSample = {
        at,
        packetsSeen,
        packetsParsed,
        seenRate:
            previous && elapsed && packetsSeen >= previous.packetsSeen
                ? ((packetsSeen - previous.packetsSeen) * 1000n) / BigInt(elapsed)
                : undefined,
        parsedRate:
            previous && elapsed && packetsParsed >= previous.packetsParsed
                ? ((packetsParsed - previous.packetsParsed) * 1000n) / BigInt(elapsed)
                : undefined,
        ringPressure: maximumRingPressure(stats),
    }
    const next = [...history, sample]
    return next.length > limit ? next.slice(-limit) : next
}

export function chartNumber(value: bigint | undefined): number | null {
    if (value === undefined) return null
    const limit = BigInt(Number.MAX_SAFE_INTEGER)
    return Number(value > limit ? limit : value < -limit ? -limit : value)
}

function maximumRingPressure(stats: CaptureStats): number {
    let maximumBasisPoints = 0n
    for (const item of stats.interfaces) {
        const capacity = BigInt(item.ringCapacity)
        if (capacity <= 0n) continue
        const depth = BigInt(item.ringDepth)
        const boundedDepth = depth < 0n ? 0n : depth > capacity ? capacity : depth
        const basisPoints = (boundedDepth * 10_000n) / capacity
        if (basisPoints > maximumBasisPoints) maximumBasisPoints = basisPoints
    }
    return Number(maximumBasisPoints) / 100
}

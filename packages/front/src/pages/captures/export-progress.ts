import type { ExportJob } from '@repo/shared/capture'

export function exportProgressPercent(job: ExportJob | null | undefined) {
    if (!job) return null
    if (job.state === 'completed') return 100
    if (job.phase === 'reusing' || job.phase === 'finalizing') return 100
    if (job.phase === 'delivering') return 100
    const total = BigInt(job.packetsTotal)
    if (total === 0n) return null
    return Math.min(100, Number((BigInt(job.packetsWritten) * 100n) / total))
}

export function aggregateExportProgressPercent(jobs: ReadonlyArray<ExportJob>) {
    if (jobs.length === 0) return null
    const percentages = jobs.map(exportProgressPercent)
    if (percentages.every((value) => value === null)) return null
    const weights = jobs.map((job) => {
        const estimatedBytes = BigInt(job.estimatedBytes)
        return estimatedBytes > 0n ? estimatedBytes : 1n
    })
    const totalWeight = weights.reduce((total, weight) => total + weight, 0n)
    const weightedProgress = percentages.reduce(
        (total, value, index) => total + weights[index]! * BigInt(value ?? 0),
        0n,
    )
    return Number(weightedProgress / totalWeight)
}

export function exportProgressLabel(job: ExportJob | null | undefined) {
    switch (job?.phase) {
        case 'encoding':
            return 'Writing packets'
        case 'reusing':
            return 'Reusing prepared file'
        case 'finalizing':
            return 'Finalizing file'
        case 'delivering':
            return 'Saving export'
        default:
            return 'Preparing snapshot'
    }
}

import type { ExportProgress } from '@repo/shared/capture'

export function exportProgressPercent(progress: ExportProgress | null | undefined) {
    if (!progress) return null
    if (progress.phase === 'reusing' || progress.phase === 'finalizing') return 100
    if (progress.phase === 'delivering') return 100
    const total = BigInt(progress.packetsTotal)
    if (total === 0n) return null
    return Number((BigInt(progress.packetsWritten) * 100n) / total)
}

export function exportProgressLabel(progress: ExportProgress | null | undefined) {
    switch (progress?.phase) {
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

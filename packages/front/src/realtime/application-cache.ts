import { MAX_RECENT_EXPORT_JOBS, type CaptureRecord, type ExportJob } from '@repo/shared/capture'

export function sortCaptures(captures: ReadonlyArray<CaptureRecord>) {
    return [...captures].sort((left, right) => {
        const leftStarted = BigInt(left.startedAtNs)
        const rightStarted = BigInt(right.startedAtNs)
        return leftStarted === rightStarted ? 0 : leftStarted > rightStarted ? -1 : 1
    })
}

export function normalizeExportJobs(exports: ReadonlyArray<ExportJob>) {
    const running = exports.filter((job) => job.state === 'running')
    const terminal = exports
        .filter((job) => job.state !== 'running')
        .sort((left, right) => {
            const leftFinished = BigInt(left.finishedAtNs ?? left.startedAtNs)
            const rightFinished = BigInt(right.finishedAtNs ?? right.startedAtNs)
            return leftFinished === rightFinished ? 0 : leftFinished > rightFinished ? -1 : 1
        })
        .slice(0, MAX_RECENT_EXPORT_JOBS)
    return [...running, ...terminal].sort((left, right) => {
        if (left.state === 'running' && right.state !== 'running') return -1
        if (left.state !== 'running' && right.state === 'running') return 1
        const leftStarted = BigInt(left.startedAtNs)
        const rightStarted = BigInt(right.startedAtNs)
        return leftStarted === rightStarted ? 0 : leftStarted > rightStarted ? -1 : 1
    })
}

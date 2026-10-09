import type { CaptureRecord } from '@repo/shared/capture'
import { cond } from '@repo/utils'

/** Health of a capture as the history page communicates it; drives the status label and filters. */
export type CaptureHealth = 'live' | 'healthy' | 'degraded' | 'failed'

export type CaptureHistoryFilter = 'all' | 'live' | 'issues'

export type CaptureSortKey = 'started' | 'state' | 'duration' | 'packets' | 'size'

export interface CaptureSort {
    key: CaptureSortKey
    direction: 'asc' | 'desc'
}

export const defaultCaptureSort: CaptureSort = { key: 'started', direction: 'desc' }

export const captureHealthLabel: Record<CaptureHealth, string> = {
    live: 'Live',
    healthy: 'Complete',
    degraded: 'Partial',
    failed: 'Failed',
}

const NS_PER_MS = 1_000_000n
const NS_PER_SECOND = 1_000_000_000n

export function nsToMs(value: string) {
    return Number(BigInt(value) / NS_PER_MS)
}

export function isLiveCapture(capture: CaptureRecord) {
    return capture.state === 'capturing' || capture.state === 'stopping'
}

export function captureHealth(capture: CaptureRecord): CaptureHealth {
    return (
        cond<CaptureHealth>(
            [isLiveCapture(capture), 'live'],
            [capture.state === 'failed' || capture.failure !== null, 'failed'],
            [
                capture.retainedPortionOnly ||
                    capture.state === 'interrupted' ||
                    capture.state === 'recovering',
                'degraded',
            ],
        ) ?? 'healthy'
    )
}

/** The short, human label of what was captured: interface names, or the replay origin. */
export function captureSourceLabel(capture: CaptureRecord) {
    if (capture.interfaceNames.length > 0) return capture.interfaceNames.join(', ')
    return capture.source._tag === 'Replay' ? 'Replay' : 'Unknown source'
}

/** One-line explanation shown next to the source, only when something needs attention. */
export function captureNotice(capture: CaptureRecord) {
    return cond(
        [capture.failure !== null, capture.failure?.code],
        [capture.state === 'interrupted', 'Interrupted'],
        [capture.state === 'recovering', 'Recovering'],
        [capture.retainedPortionOnly, 'Retained portion only'],
    )
}

export function captureDurationSeconds(capture: CaptureRecord, nowMs = Date.now()) {
    const start = BigInt(capture.startedAtNs)
    const end = capture.stoppedAtNs ? BigInt(capture.stoppedAtNs) : BigInt(nowMs) * NS_PER_MS
    return end > start ? Number((end - start) / NS_PER_SECOND) : 0
}

export function formatDuration(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3_600)
    const minutes = Math.floor((totalSeconds % 3_600) / 60)
    const seconds = totalSeconds % 60
    if (hours > 0) return `${hours} h ${minutes.toString().padStart(2, '0')}`
    if (minutes > 0) return `${minutes} min ${seconds.toString().padStart(2, '0')}`
    return `${seconds} s`
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
})
const shortDateTimeFormat = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
})
const shortDateTimeWithYearFormat = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
})

export function formatDateTime(ns: string | null) {
    return ns ? dateTimeFormat.format(nsToMs(ns)) : '—'
}

/** Compact start time for table cells; the year only appears when it is not the current one. */
export function formatShortDateTime(ns: string, nowMs = Date.now()) {
    const ms = nsToMs(ns)
    const sameYear = new Date(ms).getFullYear() === new Date(nowMs).getFullYear()
    return (sameYear ? shortDateTimeFormat : shortDateTimeWithYearFormat).format(ms)
}

const healthRank: Record<CaptureHealth, number> = { live: 0, failed: 1, degraded: 2, healthy: 3 }

function compareBigInt(left: bigint, right: bigint) {
    return cond([left > right, 1], [left < right, -1]) ?? 0
}

const compareBy: Record<
    CaptureSortKey,
    (left: CaptureRecord, right: CaptureRecord, nowMs: number) => number
> = {
    started: (left, right) => compareBigInt(BigInt(left.startedAtNs), BigInt(right.startedAtNs)),
    state: (left, right) => healthRank[captureHealth(left)] - healthRank[captureHealth(right)],
    duration: (left, right, nowMs) =>
        captureDurationSeconds(left, nowMs) - captureDurationSeconds(right, nowMs),
    packets: (left, right) => compareBigInt(BigInt(left.packetCount), BigInt(right.packetCount)),
    size: (left, right) => compareBigInt(BigInt(left.retainedBytes), BigInt(right.retainedBytes)),
}

/** Ties fall back to newest first so equal rows keep a predictable order across pages. */
export function sortCaptures(
    captures: readonly CaptureRecord[],
    sort: CaptureSort,
    nowMs = Date.now(),
) {
    const sign = sort.direction === 'asc' ? 1 : -1
    return [...captures].sort(
        (left, right) =>
            sign * compareBy[sort.key](left, right, nowMs) || compareBy.started(right, left, nowMs),
    )
}

/** Toggles direction on the active column; a new column starts with its most useful order. */
export function nextCaptureSort(current: CaptureSort, key: CaptureSortKey): CaptureSort {
    if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    }
    return { key, direction: key === 'state' ? 'asc' : 'desc' }
}

export function matchesCaptureFilter(
    capture: CaptureRecord,
    filter: CaptureHistoryFilter,
    search: string,
) {
    const health = captureHealth(capture)
    if (filter === 'live' && health !== 'live') return false
    if (filter === 'issues' && health !== 'failed' && health !== 'degraded') return false
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return true
    return [
        capture.captureId,
        capture.state,
        capture.sourceFormat,
        captureSourceLabel(capture),
        capture.failure?.code,
        capture.failure?.message,
    ].some((value) => value?.toLocaleLowerCase().includes(needle))
}

import type { CaptureRecord } from '@repo/shared/capture'
import { cond } from '@repo/utils'

/** Health of a capture as the history page communicates it; drives the dot color and filters. */
export type CaptureHealth = 'live' | 'healthy' | 'degraded' | 'failed'

export type CaptureHistoryFilter = 'all' | 'live' | 'issues'

export interface CaptureDayGroup {
    key: string
    startedAtMs: number
    captures: CaptureRecord[]
    retainedBytes: bigint
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

const timeFormat = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
})
const dayFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const weekdayFormat = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
})

export function formatTime(ns: string) {
    return timeFormat.format(nsToMs(ns))
}

export function formatDateTime(ns: string | null) {
    return ns ? dateTimeFormat.format(nsToMs(ns)) : '—'
}

/** Start and end clock times; a capture still running has no end yet. */
export function formatTimeRange(capture: CaptureRecord) {
    const start = formatTime(capture.startedAtNs)
    if (!capture.stoppedAtNs) return `${start} → now`
    const end = formatTime(capture.stoppedAtNs)
    return start === end ? start : `${start} → ${end}`
}

function localDayKey(ms: number) {
    const date = new Date(ms)
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatDayLabel(ms: number, nowMs = Date.now()) {
    const today = new Date(nowMs)
    today.setHours(0, 0, 0, 0)
    const day = new Date(ms)
    day.setHours(0, 0, 0, 0)
    const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000)
    return (
        cond(
            [daysAgo === 0, 'Today'],
            [daysAgo === 1, 'Yesterday'],
            [daysAgo > 1 && daysAgo < 7, weekdayFormat.format(ms)],
        ) ?? dayFormat.format(ms)
    )
}

function compareNewestFirst(left: CaptureRecord, right: CaptureRecord) {
    const a = BigInt(left.startedAtNs)
    const b = BigInt(right.startedAtNs)
    return cond([a > b, -1], [a < b, 1]) ?? 0
}

/** Sorts captures newest first and buckets them by the local calendar day they started on. */
export function groupCapturesByDay(captures: readonly CaptureRecord[]): CaptureDayGroup[] {
    const groups: CaptureDayGroup[] = []
    for (const capture of [...captures].sort(compareNewestFirst)) {
        const startedAtMs = nsToMs(capture.startedAtNs)
        const key = localDayKey(startedAtMs)
        const current = groups.at(-1)
        if (current?.key === key) {
            current.captures.push(capture)
            current.retainedBytes += BigInt(capture.retainedBytes)
        } else {
            groups.push({
                key,
                startedAtMs,
                captures: [capture],
                retainedBytes: BigInt(capture.retainedBytes),
            })
        }
    }
    return groups
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

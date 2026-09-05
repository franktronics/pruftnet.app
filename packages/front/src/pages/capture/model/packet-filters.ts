import {
    PacketSummaryFilter,
    type PacketSummary,
    type PacketSummaryParseCondition,
} from '@repo/shared/capture'

import type { SummaryRow } from '#front/pages/capture/hooks/use-packet-summaries'

export const parseConditions = ['complete', 'partial', 'malformed', 'resourceLimit'] as const
export type PacketParseCondition = PacketSummaryParseCondition

export interface PacketTimeRange {
    readonly minSeconds: string
    readonly maxSeconds: string
}

export interface PacketDisplayFilters {
    readonly search: string
    readonly timeRange: PacketTimeRange | null
    readonly protocolIds: readonly number[]
    readonly interfaceIds: readonly number[]
    readonly minLength: string
    readonly maxLength: string
    readonly parseConditions: readonly PacketParseCondition[]
    readonly source: string
    readonly destination: string
}

export const emptyPacketDisplayFilters: PacketDisplayFilters = {
    search: '',
    timeRange: null,
    protocolIds: [],
    interfaceIds: [],
    minLength: '',
    maxLength: '',
    parseConditions: [...parseConditions],
    source: '',
    destination: '',
}

const secondsPattern = /^(?:0|[1-9][0-9]*)(?:\.[0-9]{0,6})?$/
const integerPattern = /^(?:0|[1-9][0-9]*)$/

function normalized(value: string): string {
    return value.trim().toLowerCase()
}

function parseSeconds(value: string): bigint | undefined {
    const trimmed = value.trim()
    if (!secondsPattern.test(trimmed)) return undefined
    const [whole = '0', fraction = ''] = trimmed.split('.')
    return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'))
}

function parseLength(value: string): number | undefined {
    const trimmed = value.trim()
    if (!integerPattern.test(trimmed)) return undefined
    const parsed = Number(trimmed)
    return Number.isSafeInteger(parsed) ? parsed : undefined
}

function columnValue(summary: PacketSummary, key: string): string {
    return summary.columns.find((column) => column.key === key)?.value ?? ''
}

export function validatePacketDisplayFilters(filters: PacketDisplayFilters): string | undefined {
    if (filters.timeRange) {
        const min = parseSeconds(filters.timeRange.minSeconds)
        const max = parseSeconds(filters.timeRange.maxSeconds)
        if (min === undefined || max === undefined)
            return 'Time values must be non-negative numbers with up to 6 decimal places.'
        if (min > max) return 'The minimum time must not exceed the maximum time.'
    }
    const minLength = filters.minLength ? parseLength(filters.minLength) : undefined
    const maxLength = filters.maxLength ? parseLength(filters.maxLength) : undefined
    if (filters.minLength && minLength === undefined)
        return 'Minimum length must be a non-negative integer.'
    if (filters.maxLength && maxLength === undefined)
        return 'Maximum length must be a non-negative integer.'
    if (minLength !== undefined && maxLength !== undefined && minLength > maxLength)
        return 'The minimum length must not exceed the maximum length.'
    return undefined
}

export function countAdvancedPacketFilters(filters: PacketDisplayFilters): number {
    return (
        Number(filters.timeRange !== null) +
        Number(filters.protocolIds.length > 0) +
        Number(filters.interfaceIds.length > 0) +
        Number(filters.minLength.trim() !== '' || filters.maxLength.trim() !== '') +
        Number(filters.parseConditions.length !== parseConditions.length) +
        Number(filters.source.trim() !== '') +
        Number(filters.destination.trim() !== '')
    )
}

export function toPacketSummaryFilter(filters: PacketDisplayFilters): PacketSummaryFilter | null {
    if (validatePacketDisplayFilters(filters)) return null
    const search = normalized(filters.search)
    const source = normalized(filters.source)
    const destination = normalized(filters.destination)
    const minRelativeTimestampNs = filters.timeRange
        ? parseSeconds(filters.timeRange.minSeconds)
        : undefined
    const maxRelativeTimestampNs = filters.timeRange
        ? parseSeconds(filters.timeRange.maxSeconds)
        : undefined
    const minWireLength = filters.minLength ? parseLength(filters.minLength) : undefined
    const maxWireLength = filters.maxLength ? parseLength(filters.maxLength) : undefined
    const protocolIds = [...new Set(filters.protocolIds)].sort((left, right) => left - right)
    const interfaceIds = [...new Set(filters.interfaceIds)].sort((left, right) => left - right)
    const conditions = parseConditions.filter((condition) =>
        filters.parseConditions.includes(condition),
    )
    const unfiltered =
        !search &&
        minRelativeTimestampNs === undefined &&
        maxRelativeTimestampNs === undefined &&
        protocolIds.length === 0 &&
        interfaceIds.length === 0 &&
        minWireLength === undefined &&
        maxWireLength === undefined &&
        conditions.length === parseConditions.length &&
        !source &&
        !destination
    if (unfiltered) return null
    return new PacketSummaryFilter({
        search,
        minRelativeTimestampNs: minRelativeTimestampNs?.toString() ?? null,
        maxRelativeTimestampNs: maxRelativeTimestampNs?.toString() ?? null,
        protocolIds,
        interfaceIds,
        minWireLength: minWireLength ?? null,
        maxWireLength: maxWireLength ?? null,
        parseConditions: conditions,
        source,
        destination,
    })
}

export function relativePacketNanoseconds(timestampNs: string, originTimestampNs: string): bigint {
    const delta = BigInt(timestampNs) - BigInt(originTimestampNs)
    return delta < 0n ? 0n : delta
}

export function relativeSecondsNumber(timestampNs: string, originTimestampNs: string): number {
    const seconds =
        Number(relativePacketNanoseconds(timestampNs, originTimestampNs)) / 1_000_000_000
    return Number.isFinite(seconds)
        ? Math.min(seconds, Number.MAX_SAFE_INTEGER)
        : Number.MAX_SAFE_INTEGER
}

export function secondsFromNumber(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0'
    return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

const filterMatches = new WeakMap<
    PacketDisplayFilters,
    {
        origin: string | undefined
        matches: WeakMap<PacketSummary, boolean>
    }
>()

export function filterPacketRows(
    rows: readonly SummaryRow[],
    filters: PacketDisplayFilters,
    originTimestampNs?: string,
): readonly SummaryRow[] {
    const error = validatePacketDisplayFilters(filters)
    if (error) return rows.filter((row) => row.kind === 'gap')

    if (!filters.search.trim() && countAdvancedPacketFilters(filters) === 0) return rows

    const text = normalized(filters.search)
    const source = normalized(filters.source)
    const destination = normalized(filters.destination)
    const minTime = filters.timeRange ? parseSeconds(filters.timeRange.minSeconds) : undefined
    const maxTime = filters.timeRange ? parseSeconds(filters.timeRange.maxSeconds) : undefined
    const minLength = filters.minLength ? parseLength(filters.minLength) : undefined
    const maxLength = filters.maxLength ? parseLength(filters.maxLength) : undefined
    const protocols = new Set(filters.protocolIds)
    const interfaces = new Set(filters.interfaceIds)
    const statuses = new Set(filters.parseConditions)

    let cached = filterMatches.get(filters)
    if (!cached || cached.origin !== originTimestampNs) {
        cached = { origin: originTimestampNs, matches: new WeakMap() }
        filterMatches.set(filters, cached)
    }
    const matches = (summary: PacketSummary) => {
        if (text && !summary.columns.some((column) => normalized(column.value).includes(text)))
            return false
        if (filters.timeRange) {
            if (!originTimestampNs || minTime === undefined || maxTime === undefined) return false
            const relative = relativePacketNanoseconds(summary.timestampNs, originTimestampNs)
            if (relative < minTime || relative > maxTime) return false
        }
        if (protocols.size > 0 && !summary.protocolPath.some((protocol) => protocols.has(protocol)))
            return false
        if (interfaces.size > 0 && !interfaces.has(summary.interfaceId)) return false
        if (minLength !== undefined && summary.wireLength < minLength) return false
        if (maxLength !== undefined && summary.wireLength > maxLength) return false
        if (!statuses.has(summary.parseCondition)) return false
        if (source && !normalized(columnValue(summary, 'source')).includes(source)) return false
        if (destination && !normalized(columnValue(summary, 'destination')).includes(destination))
            return false
        return true
    }
    return rows.filter((row) => {
        if (row.kind === 'gap') return true
        const previous = cached.matches.get(row.summary)
        if (previous !== undefined) return previous
        const result = matches(row.summary)
        cached.matches.set(row.summary, result)
        return result
    })
}

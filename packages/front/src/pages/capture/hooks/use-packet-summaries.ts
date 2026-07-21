import type {
    PacketSummary,
    PacketSummaryBatch,
    PacketSummaryFilter,
    PacketSummaryRange,
} from '@repo/shared/capture'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'

export const PACKET_SUMMARY_PAGE_SIZE = 1_024
export const MAX_PACKET_SUMMARIES = 50_000
export const MAX_CACHED_HISTORY_PAGES = 12
export type SummaryReadMode = 'history' | 'live'

export type SummaryRow =
    | { readonly kind: 'gap'; readonly beforeCursor: string | null }
    | { readonly kind: 'packet'; readonly summary: PacketSummary }

export interface SummaryState {
    readonly rows: readonly SummaryRow[]
    readonly cursor?: string
    readonly complete: boolean
    readonly originTimestampNs?: string
}

export const emptySummaryState: SummaryState = { rows: [], complete: false }

export function mergeSummaryBatch(
    captureId: string,
    state: SummaryState,
    batch: PacketSummaryBatch,
    maximum = MAX_PACKET_SUMMARIES,
): SummaryState {
    if (batch.captureId !== captureId) return state
    const existing = state.rows.filter(
        (row): row is Extract<SummaryRow, { kind: 'packet' }> => row.kind === 'packet',
    )
    const incoming = batch.summaries
    let existingIndex = 0
    let incomingIndex = 0
    const ordered: PacketSummary[] = []
    if (existing.length > 0 && incoming.length > 0) {
        const firstIncoming = BigInt(incoming[0]!.cursor)
        const lastExisting = BigInt(existing.at(-1)!.summary.cursor)
        if (lastExisting < firstIncoming) {
            existingIndex = existing.length
            for (const row of existing) ordered.push(row.summary)
        } else {
            // Search backward because incremental cursor batches can only overlap the retained tail.
            existingIndex = existing.length - 1
            while (
                existingIndex > 0 &&
                BigInt(existing[existingIndex - 1]!.summary.cursor) >= firstIncoming
            )
                existingIndex--
            for (let index = 0; index < existingIndex; index++)
                ordered.push(existing[index]!.summary)
        }
    }
    // Merge only the overlap; the common incremental path above goes directly to tail append.
    while (existingIndex < existing.length && incomingIndex < incoming.length) {
        const previous = existing[existingIndex]!.summary
        const next = incoming[incomingIndex]!
        if (previous.cursor === next.cursor) {
            ordered.push(next)
            existingIndex++
            incomingIndex++
            continue
        }
        if (BigInt(previous.cursor) < BigInt(next.cursor)) {
            ordered.push(previous)
            existingIndex++
            continue
        }
        ordered.push(next)
        incomingIndex++
    }
    while (existingIndex < existing.length) ordered.push(existing[existingIndex++]!.summary)
    while (incomingIndex < incoming.length) ordered.push(incoming[incomingIndex++]!)
    const trim = Math.max(0, ordered.length - maximum)
    const bounded = trim === 0 ? ordered : ordered.slice(trim)
    const dropped = trim > 0
    const gap = batch.gapBeforeFirst || dropped || state.rows.some((row) => row.kind === 'gap')
    return {
        rows: [
            ...(gap ? ([{ kind: 'gap', beforeCursor: bounded[0]?.cursor ?? null }] as const) : []),
            ...bounded.map((summary) => ({ kind: 'packet', summary }) as const),
        ],
        cursor: batch.lastCursor ?? state.cursor,
        complete: batch.captureComplete,
        originTimestampNs:
            state.originTimestampNs ?? incoming[0]?.timestampNs ?? bounded[0]?.timestampNs,
    }
}

type PacketSummaryReader = (captureId: string, afterCursor?: string) => Promise<PacketSummaryBatch>

function abortedSummaryRequest() {
    return new DOMException('Packet summary request aborted', 'AbortError')
}

export async function readPacketSummaryState(
    captureId: string,
    state: SummaryState,
    mode: SummaryReadMode,
    readBatch: PacketSummaryReader,
    signal: AbortSignal,
): Promise<SummaryState> {
    let next = state
    while (!signal.aborted) {
        const previousCursor = next.cursor
        const batch = await readBatch(captureId, previousCursor)
        if (signal.aborted) throw abortedSummaryRequest()
        if (batch.captureId !== captureId) throw new Error('Stale packet summary batch')
        next = mergeSummaryBatch(
            captureId,
            next,
            batch,
            mode === 'live' ? MAX_PACKET_SUMMARIES : Number.POSITIVE_INFINITY,
        )
        if (
            mode === 'history' ||
            batch.captureComplete ||
            batch.summaries.length < PACKET_SUMMARY_PAGE_SIZE
        )
            return next
        if (!next.cursor || next.cursor === previousCursor)
            throw new Error('Packet summary cursor did not advance')
    }
    throw abortedSummaryRequest()
}

export function packetSummaryPageStarts(
    startIndex: number,
    endIndex: number,
    rowCount: number,
    prefetchPages = 1,
): ReadonlyArray<number> {
    if (rowCount <= 0) return []
    const firstVisible = Math.max(0, Math.min(rowCount - 1, startIndex))
    const lastVisible = Math.max(firstVisible, Math.min(rowCount - 1, endIndex))
    const firstPage = Math.max(
        0,
        Math.floor(firstVisible / PACKET_SUMMARY_PAGE_SIZE) - prefetchPages,
    )
    const lastPage = Math.min(
        Math.ceil(rowCount / PACKET_SUMMARY_PAGE_SIZE) - 1,
        Math.floor(lastVisible / PACKET_SUMMARY_PAGE_SIZE) + prefetchPages,
    )
    return Array.from(
        { length: lastPage - firstPage + 1 },
        (_, offset) => (firstPage + offset) * PACKET_SUMMARY_PAGE_SIZE,
    )
}

interface SummaryVisibleRange {
    readonly datasetKey: string
    readonly startIndex: number
    readonly endIndex: number
}

const initialVisibleRange: SummaryVisibleRange = {
    datasetKey: '',
    startIndex: 0,
    endIndex: PACKET_SUMMARY_PAGE_SIZE - 1,
}

function useLivePacketSummaries(captureId: string, enabled: boolean) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: captureKeys.liveSummaries(captureId),
        queryFn: async ({ signal }) => {
            const current =
                queryClient.getQueryData<SummaryState>(captureKeys.liveSummaries(captureId)) ??
                emptySummaryState
            return readPacketSummaryState(
                captureId,
                current,
                'live',
                captureClient.summaries,
                signal,
            )
        },
        enabled,
        placeholderData: emptySummaryState,
        staleTime: Infinity,
        structuralSharing: false,
    })
    return {
        state: query.data ?? emptySummaryState,
        error: query.error,
        isInitialLoading: enabled && query.isFetching && (query.data?.rows.length ?? 0) === 0,
        isLoadingMore: enabled && query.isFetching && (query.data?.rows.length ?? 0) > 0,
        retry: query.refetch,
    }
}

function useHistoricalPacketSummaries(
    captureId: string,
    filter: PacketSummaryFilter | null,
    enabled: boolean,
) {
    const queryClient = useQueryClient()
    const rangeDatasetKey = `${captureId}:${JSON.stringify(filter)}`
    const [storedVisibleRange, setVisibleRange] = useState<SummaryVisibleRange>(initialVisibleRange)
    const visibleRange =
        storedVisibleRange.datasetKey === rangeDatasetKey
            ? storedVisibleRange
            : { ...initialVisibleRange, datasetKey: rangeDatasetKey }
    const manifest = useQuery({
        queryKey: captureKeys.summaryManifest(captureId, filter),
        queryFn: ({ signal }) => captureClient.summaryManifest(captureId, filter, signal),
        enabled,
        staleTime: Infinity,
    })
    const gapOffset = manifest.data?.hasGaps ? 1 : 0
    const packetRowCount = manifest.data?.rowCount ?? 0
    const virtualRowCount = packetRowCount + gapOffset
    const packetStartIndex = Math.max(0, visibleRange.startIndex - gapOffset)
    const packetEndIndex = Math.max(packetStartIndex, visibleRange.endIndex - gapOffset)
    const pageStarts = useMemo(
        () => packetSummaryPageStarts(packetStartIndex, packetEndIndex, packetRowCount),
        [packetEndIndex, packetRowCount, packetStartIndex],
    )
    const pages = useQueries({
        queries:
            enabled && manifest.data
                ? pageStarts.map((startIndex) => ({
                      queryKey: captureKeys.summaryRange(
                          captureId,
                          manifest.data.revision,
                          filter,
                          startIndex,
                      ),
                      queryFn: ({ signal }: { signal: AbortSignal }) =>
                          captureClient.summaryRange(
                              captureId,
                              manifest.data!.revision,
                              filter,
                              startIndex,
                              Math.min(PACKET_SUMMARY_PAGE_SIZE, packetRowCount - startIndex),
                              signal,
                          ),
                      staleTime: Infinity,
                      gcTime: 60_000,
                  }))
                : [],
    })
    const pageData = useMemo(() => {
        const byStart = new Map<number, PacketSummaryRange>()
        for (let index = 0; index < pageStarts.length; index++) {
            const page = pages[index]?.data
            if (page) byStart.set(pageStarts[index]!, page)
        }
        return byStart
    }, [pageStarts, pages])
    const getPage = useCallback(
        (startIndex: number) => {
            const activePage = pageData.get(startIndex)
            if (activePage) return activePage
            const revision = manifest.data?.revision
            if (!revision) return undefined
            return queryClient.getQueryData<PacketSummaryRange>(
                captureKeys.summaryRange(captureId, revision, filter, startIndex),
            )
        },
        [captureId, filter, manifest.data?.revision, pageData, queryClient],
    )

    useEffect(() => {
        if (!enabled) return
        const timeout = window.setTimeout(() => {
            const cached = queryClient
                .getQueryCache()
                .findAll({ queryKey: captureKeys.summaryRanges(captureId) })
            let excess = cached.length - MAX_CACHED_HISTORY_PAGES
            if (excess <= 0) return
            const inactive = cached
                .filter((query) => !query.isActive())
                .sort((left, right) => left.state.dataUpdatedAt - right.state.dataUpdatedAt)
            for (const query of inactive) {
                if (excess-- <= 0) break
                queryClient.removeQueries({ queryKey: query.queryKey, exact: true })
            }
        }, 0)
        return () => window.clearTimeout(timeout)
    }, [captureId, enabled, pageStarts, queryClient])

    const getRow = useCallback(
        (index: number): SummaryRow | undefined => {
            if (manifest.data?.hasGaps && index === 0)
                return {
                    kind: 'gap',
                    beforeCursor: getPage(0)?.summaries[0]?.cursor ?? null,
                }
            const packetIndex = index - gapOffset
            if (packetIndex < 0 || packetIndex >= packetRowCount) return undefined
            const pageStart =
                Math.floor(packetIndex / PACKET_SUMMARY_PAGE_SIZE) * PACKET_SUMMARY_PAGE_SIZE
            const summary = getPage(pageStart)?.summaries[packetIndex - pageStart]
            return summary ? { kind: 'packet', summary } : undefined
        },
        [gapOffset, getPage, manifest.data?.hasGaps, packetRowCount],
    )
    const requestRange = useCallback(
        (startIndex: number, endIndex: number) => {
            const next = {
                datasetKey: rangeDatasetKey,
                startIndex: Math.max(0, startIndex),
                endIndex: Math.max(startIndex, endIndex),
            }
            setVisibleRange((current) =>
                current.datasetKey === next.datasetKey &&
                current.startIndex === next.startIndex &&
                current.endIndex === next.endIndex
                    ? current
                    : next,
            )
        },
        [rangeDatasetKey],
    )
    const retry = useCallback(() => {
        if (manifest.error) {
            void manifest.refetch()
            return
        }
        for (const page of pages) if (page.error) void page.refetch()
    }, [manifest, pages])
    const rangeError = pages.find((page) => page.error)?.error
    const firstPageLoaded = packetRowCount === 0 || getPage(0) !== undefined
    const isInitialLoading =
        enabled && (manifest.isPending || (manifest.isSuccess && !firstPageLoaded))

    return {
        rowCount: virtualRowCount,
        packetRowCount,
        totalRowCount: manifest.data?.totalRowCount ?? 0,
        originTimestampNs: manifest.data?.originTimestampNs ?? undefined,
        lastTimestampNs: manifest.data?.lastTimestampNs ?? undefined,
        getRow,
        requestRange,
        error: manifest.error ?? rangeError,
        isInitialLoading,
        isLoadingMore: !isInitialLoading && pages.some((page) => page.isFetching),
        retry,
        datasetKey: `${rangeDatasetKey}:${manifest.data?.revision ?? 'loading'}`,
    }
}

export function usePacketSummaries(
    captureId: string,
    options: {
        readonly enabled: boolean
        readonly mode: SummaryReadMode
        readonly filter?: PacketSummaryFilter | null
    },
) {
    const live = useLivePacketSummaries(captureId, options.enabled && options.mode === 'live')
    const history = useHistoricalPacketSummaries(
        captureId,
        options.filter ?? null,
        options.enabled && options.mode === 'history',
    )
    if (options.mode === 'history') {
        return {
            mode: 'history' as const,
            rows: [] as readonly SummaryRow[],
            cursor: undefined,
            complete: true,
            ...history,
        }
    }
    const state = live.state
    return {
        mode: 'live' as const,
        ...state,
        rowCount: state.rows.length,
        packetRowCount: state.rows.filter((row) => row.kind === 'packet').length,
        totalRowCount: state.rows.filter((row) => row.kind === 'packet').length,
        lastTimestampNs: state.rows.findLast((row) => row.kind === 'packet')?.summary.timestampNs,
        getRow: (index: number) => state.rows[index],
        requestRange: () => undefined,
        error: live.error,
        isInitialLoading: live.isInitialLoading,
        isLoadingMore: live.isLoadingMore,
        retry: live.retry,
        datasetKey: `${captureId}:live`,
    }
}

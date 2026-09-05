import type { PacketSummary, PacketSummaryBatch, PacketSummaryFilter } from '@repo/shared/capture'
import { PacketSummaryManifest, PacketSummaryRange } from '@repo/shared/capture'
import { skipToken, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { subscribeRpcStream } from '#front/config/effect-runtime'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'
import {
    estimatePacketSummaryRangeBytes,
    packetSummaryPageCache,
} from '#front/pages/capture/model/packet-summary-cache'

export const PACKET_SUMMARY_PAGE_SIZE = 256
export const MAX_PACKET_SUMMARIES = 50_000
export type SummaryReadMode = 'history' | 'live'

export type SummaryRow =
    | { readonly kind: 'gap'; readonly beforeCursor: string | null }
    | { readonly kind: 'packet'; readonly summary: PacketSummary }

export interface SummaryState {
    readonly rows: readonly SummaryRow[]
    readonly cursor?: string
    readonly complete: boolean
    readonly originTimestampNs?: string
    readonly maximumTimestampNs?: string
}

export const emptySummaryState: SummaryState = { rows: [], complete: false }

export function mergeSummaryBatch(
    captureId: string,
    state: SummaryState,
    batch: PacketSummaryBatch,
    maximum = MAX_PACKET_SUMMARIES,
): SummaryState {
    if (batch.captureId !== captureId) return state
    const originTimestampNs =
        batch.originTimestampNs ?? state.originTimestampNs ?? batch.summaries[0]?.timestampNs
    let maximumTimestampNs = state.maximumTimestampNs
    for (const summary of batch.summaries) {
        if (!maximumTimestampNs || BigInt(summary.timestampNs) > BigInt(maximumTimestampNs))
            maximumTimestampNs = summary.timestampNs
    }
    if (batch.summaries.length === 0) {
        return state.complete === batch.captureComplete &&
            state.originTimestampNs === originTimestampNs
            ? state
            : { ...state, complete: batch.captureComplete, originTimestampNs, maximumTimestampNs }
    }
    const gapOffset = Number(state.rows[0]?.kind === 'gap')
    const last = state.rows.at(-1)
    if (
        !last ||
        (last.kind === 'packet' && BigInt(last.summary.cursor) < BigInt(batch.summaries[0]!.cursor))
    ) {
        const count = state.rows.length - gapOffset + batch.summaries.length
        const trim = Math.max(0, count - maximum)
        const skipIncoming = Math.max(0, trim - (state.rows.length - gapOffset))
        const retained = state.rows.slice(gapOffset + trim)
        const added = batch.summaries
            .slice(skipIncoming)
            .map((summary) => ({ kind: 'packet', summary }) as const)
        const first = retained[0] ?? added[0]
        const gap = gapOffset > 0 || trim > 0 || batch.gapBeforeFirst
        return {
            rows: gap
                ? [
                      {
                          kind: 'gap',
                          beforeCursor: first?.kind === 'packet' ? first.summary.cursor : null,
                      },
                      ...retained,
                      ...added,
                  ]
                : retained.concat(added),
            cursor: batch.lastCursor ?? state.cursor,
            complete: batch.captureComplete,
            originTimestampNs,
            maximumTimestampNs,
        }
    }
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
        originTimestampNs,
        maximumTimestampNs,
    }
}

type PacketSummaryReader = (
    captureId: string,
    afterCursor: string | undefined,
    signal: AbortSignal,
) => Promise<PacketSummaryBatch>

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
        const batch = await readBatch(captureId, previousCursor, signal)
        if (signal.aborted) throw abortedSummaryRequest()
        if (batch.captureId !== captureId) throw new Error('Stale packet summary batch')
        next = mergeSummaryBatch(
            captureId,
            next,
            batch,
            mode === 'live' ? MAX_PACKET_SUMMARIES : Number.POSITIVE_INFINITY,
        )
        if (batch.summaries.length === 0 || next.cursor !== previousCursor) return next
        if (!next.cursor || next.cursor === previousCursor)
            throw new Error('Packet summary cursor did not advance')
    }
    throw abortedSummaryRequest()
}

export function packetSummaryPageStarts(
    startIndex: number,
    endIndex: number,
    rowCount: number,
    prefetchBefore = 1,
    prefetchAfter = prefetchBefore,
): ReadonlyArray<number> {
    if (rowCount <= 0) return []
    const firstVisible = Math.max(0, Math.min(rowCount - 1, startIndex))
    const lastVisible = Math.max(firstVisible, Math.min(rowCount - 1, endIndex))
    const firstPage = Math.max(
        0,
        Math.floor(firstVisible / PACKET_SUMMARY_PAGE_SIZE) - prefetchBefore,
    )
    const lastPage = Math.min(
        Math.ceil(rowCount / PACKET_SUMMARY_PAGE_SIZE) - 1,
        Math.floor(lastVisible / PACKET_SUMMARY_PAGE_SIZE) + prefetchAfter,
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
    readonly direction: 'backward' | 'forward' | 'idle'
}

const initialVisibleRange: SummaryVisibleRange = {
    datasetKey: '',
    startIndex: 0,
    endIndex: PACKET_SUMMARY_PAGE_SIZE - 1,
    direction: 'idle',
}

function useLivePacketSummaries(captureId: string, enabled: boolean) {
    const queryClient = useQueryClient()
    const [error, setError] = useState<unknown>()
    const [attempt, setAttempt] = useState(0)
    const query = useQuery<SummaryState>({
        queryKey: captureKeys.liveSummaries(captureId),
        queryFn: skipToken,
        enabled: false,
        initialData: emptySummaryState,
        staleTime: Infinity,
        structuralSharing: false,
    })
    useEffect(() => {
        if (!enabled) return
        let current =
            queryClient.getQueryData<SummaryState>(captureKeys.liveSummaries(captureId)) ??
            emptySummaryState
        let snapshotPending = true
        let frame: number | undefined
        let unsubscribe: (() => void) | undefined
        const publish = () => {
            frame = undefined
            queryClient.setQueryData(captureKeys.liveSummaries(captureId), current)
        }
        const subscribe = () => {
            if (document.hidden || unsubscribe) return
            unsubscribe = subscribeRpcStream<PacketSummaryBatch>({
                stream: (client) =>
                    client.StreamPacketSummaries({
                        captureId,
                        afterCursor: snapshotPending ? undefined : current.cursor,
                    }),
                restartOnEnd: true,
                onValue: (batch) => {
                    setError(undefined)
                    current = mergeSummaryBatch(
                        captureId,
                        snapshotPending ? emptySummaryState : current,
                        batch,
                    )
                    snapshotPending = false
                    if (frame === undefined) frame = requestAnimationFrame(publish)
                },
                onDisconnect: setError,
            })
        }
        const visibility = () => {
            if (document.hidden) {
                unsubscribe?.()
                unsubscribe = undefined
            } else {
                snapshotPending = true
                subscribe()
            }
        }
        subscribe()
        document.addEventListener('visibilitychange', visibility)
        return () => {
            document.removeEventListener('visibilitychange', visibility)
            unsubscribe?.()
            if (frame !== undefined) cancelAnimationFrame(frame)
            publish()
        }
    }, [attempt, captureId, enabled, queryClient])
    const state = query.data ?? emptySummaryState
    return {
        state,
        error,
        isInitialLoading: enabled && state.rows.length === 0 && !state.complete,
        isLoadingMore: false,
        retry: () => setAttempt((value) => value + 1),
    }
}

function useHistoricalPacketSummaries(
    captureId: string,
    filter: PacketSummaryFilter | null,
    enabled: boolean,
) {
    const queryClient = useQueryClient()
    const cacheOwnerId = useId()
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
        refetchInterval: (query) => (query.state.data?.indexing ? 100 : false),
    })
    const gapOffset = manifest.data?.hasGaps ? 1 : 0
    const packetRowCount = manifest.data?.rowCount ?? 0
    const virtualRowCount = packetRowCount + gapOffset
    const packetStartIndex = Math.max(0, visibleRange.startIndex - gapOffset)
    const packetEndIndex = Math.max(packetStartIndex, visibleRange.endIndex - gapOffset)
    const visiblePageStarts = useMemo(
        () => packetSummaryPageStarts(packetStartIndex, packetEndIndex, packetRowCount, 0),
        [packetEndIndex, packetRowCount, packetStartIndex],
    )
    const surroundingPageStarts = useMemo(() => {
        const before = visibleRange.direction === 'backward' ? 2 : 1
        const after = visibleRange.direction === 'forward' ? 2 : 1
        const visible = new Set(visiblePageStarts)
        return packetSummaryPageStarts(
            packetStartIndex,
            packetEndIndex,
            packetRowCount,
            before,
            after,
        ).filter((startIndex) => !visible.has(startIndex))
    }, [
        packetEndIndex,
        packetRowCount,
        packetStartIndex,
        visiblePageStarts,
        visibleRange.direction,
    ])
    const revision = manifest.data?.revision
    const cacheDatasetKey = `${rangeDatasetKey}:${revision ?? 'loading'}`
    const queryForStart = (startIndex: number) => ({
        queryKey: captureKeys.summaryRange(captureId, revision!, filter, startIndex),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
            captureClient.summaryRange(
                captureId,
                revision!,
                filter,
                startIndex,
                Math.min(PACKET_SUMMARY_PAGE_SIZE, packetRowCount - startIndex),
                signal,
            ),
        initialData:
            startIndex === 0 && manifest.data?.initialSummaries
                ? new PacketSummaryRange({
                      captureId,
                      revision: revision!,
                      startIndex: 0,
                      summaries: manifest.data.initialSummaries,
                  })
                : undefined,
        staleTime: Infinity,
        gcTime: Infinity,
        structuralSharing: false,
    })
    const visiblePages = useQueries({
        queries:
            enabled && revision
                ? visiblePageStarts.map((startIndex) => queryForStart(startIndex))
                : [],
    })
    const visiblePagesReady =
        visiblePageStarts.length === 0 ||
        visiblePages.every((page) => page.data !== undefined || page.isError)
    const surroundingPages = useQueries({
        queries:
            enabled && revision && visiblePagesReady
                ? surroundingPageStarts.map((startIndex) => queryForStart(startIndex))
                : [],
    })
    useEffect(() => {
        if (!enabled || !manifest.data?.initialSummaries) return
        // useQueries has seeded the visible first page. Keep summaries exclusively
        // in the byte-budgeted range cache, not in every cached filter manifest.
        queryClient.setQueryData<PacketSummaryManifest>(
            captureKeys.summaryManifest(captureId, filter),
            (current) =>
                current?.initialSummaries
                    ? new PacketSummaryManifest({ ...current, initialSummaries: undefined })
                    : current,
        )
    }, [captureId, enabled, filter, manifest.data, queryClient])

    const pageStarts = useMemo(
        () => [...visiblePageStarts, ...surroundingPageStarts],
        [surroundingPageStarts, visiblePageStarts],
    )
    const pageData = useMemo(() => {
        const byStart = new Map<number, PacketSummaryRange>()
        for (let index = 0; index < visiblePageStarts.length; index++) {
            const page = visiblePages[index]?.data
            if (page) byStart.set(visiblePageStarts[index]!, page)
        }
        for (let index = 0; index < surroundingPageStarts.length; index++) {
            const page = surroundingPages[index]?.data
            if (page) byStart.set(surroundingPageStarts[index]!, page)
        }
        return byStart
    }, [surroundingPageStarts, surroundingPages, visiblePageStarts, visiblePages])

    useEffect(() => {
        const pinned = new Set(
            enabled && revision
                ? pageStarts.map((startIndex) => `${cacheDatasetKey}:${startIndex}`)
                : [],
        )
        packetSummaryPageCache.setPinned(cacheOwnerId, pinned)
    }, [cacheDatasetKey, cacheOwnerId, enabled, pageStarts, revision])

    useEffect(
        () => () => {
            packetSummaryPageCache.releasePins(cacheOwnerId)
        },
        [cacheOwnerId],
    )

    useEffect(() => {
        if (!revision) return
        for (const [startIndex, page] of pageData) {
            const id = `${cacheDatasetKey}:${startIndex}`
            const queryKey = captureKeys.summaryRange(captureId, revision, filter, startIndex)
            packetSummaryPageCache.register({
                id,
                datasetKey: cacheDatasetKey,
                bytes: estimatePacketSummaryRangeBytes(page),
                hasData: () => queryClient.getQueryData<PacketSummaryRange>(queryKey) !== undefined,
                remove: () => queryClient.removeQueries({ queryKey, exact: true }),
            })
        }
    }, [cacheDatasetKey, captureId, filter, pageData, queryClient, revision])

    const getPage = useCallback(
        (startIndex: number) => {
            const id = `${cacheDatasetKey}:${startIndex}`
            const activePage = pageData.get(startIndex)
            if (activePage) {
                packetSummaryPageCache.touch(id)
                return activePage
            }
            if (!revision) return undefined
            const cached = queryClient.getQueryData<PacketSummaryRange>(
                captureKeys.summaryRange(captureId, revision, filter, startIndex),
            )
            if (cached) packetSummaryPageCache.touch(id)
            return cached
        },
        [cacheDatasetKey, captureId, filter, pageData, queryClient, revision],
    )

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
            const firstPacket = Math.max(0, startIndex - gapOffset)
            const lastPacket = Math.max(firstPacket, endIndex - gapOffset)
            const firstPage =
                Math.floor(firstPacket / PACKET_SUMMARY_PAGE_SIZE) * PACKET_SUMMARY_PAGE_SIZE
            const lastPage =
                Math.floor(lastPacket / PACKET_SUMMARY_PAGE_SIZE) * PACKET_SUMMARY_PAGE_SIZE
            const next = {
                datasetKey: rangeDatasetKey,
                startIndex: firstPage + gapOffset,
                endIndex: Math.min(
                    virtualRowCount - 1,
                    lastPage + PACKET_SUMMARY_PAGE_SIZE - 1 + gapOffset,
                ),
                direction:
                    firstPage > Math.max(0, visibleRange.startIndex - gapOffset)
                        ? ('forward' as const)
                        : firstPage < Math.max(0, visibleRange.startIndex - gapOffset)
                          ? ('backward' as const)
                          : visibleRange.direction,
            }
            setVisibleRange((current) =>
                current.datasetKey === next.datasetKey &&
                current.startIndex === next.startIndex &&
                current.endIndex === next.endIndex &&
                current.direction === next.direction
                    ? current
                    : next,
            )
        },
        [
            gapOffset,
            rangeDatasetKey,
            virtualRowCount,
            visibleRange.direction,
            visibleRange.startIndex,
        ],
    )
    const retry = useCallback(() => {
        if (manifest.error) {
            void manifest.refetch()
            return
        }
        for (const page of visiblePages) if (page.error) void page.refetch()
        for (const page of surroundingPages) if (page.error) void page.refetch()
    }, [manifest, surroundingPages, visiblePages])
    const rangeError =
        visiblePages.find((page) => page.error)?.error ??
        surroundingPages.find((page) => page.error)?.error
    const firstPageLoaded = packetRowCount === 0 || getPage(0) !== undefined
    const isInitialLoading =
        enabled && (manifest.isPending || (manifest.isSuccess && !firstPageLoaded))

    return {
        indexing: manifest.data?.indexing ?? false,
        rowCount: virtualRowCount,
        packetRowCount,
        totalRowCount: manifest.data?.totalRowCount ?? 0,
        originTimestampNs: manifest.data?.originTimestampNs ?? undefined,
        lastTimestampNs: manifest.data?.lastTimestampNs ?? undefined,
        getRow,
        requestRange,
        error: manifest.error ?? rangeError,
        isInitialLoading,
        isLoadingMore:
            !isInitialLoading &&
            [...visiblePages, ...surroundingPages].some((page) => page.isFetching),
        retry,
        datasetKey: `${rangeDatasetKey}:${manifest.data?.revision ?? 'loading'}`,
    }
}

export function usePacketSummaries(
    captureId: string,
    options: {
        readonly enabled: boolean
        readonly mode: SummaryReadMode
        readonly paused?: boolean
        readonly filter?: PacketSummaryFilter | null
    },
) {
    const live = useLivePacketSummaries(
        captureId,
        options.enabled && options.mode === 'live' && !options.paused,
    )
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
        indexing: false,
        ...state,
        rowCount: state.rows.length,
        packetRowCount: state.rows.length - Number(state.rows[0]?.kind === 'gap'),
        totalRowCount: state.rows.length - Number(state.rows[0]?.kind === 'gap'),
        lastTimestampNs: state.maximumTimestampNs,
        getRow: (index: number) => state.rows[index],
        requestRange: () => undefined,
        error: live.error,
        isInitialLoading: live.isInitialLoading,
        isLoadingMore: live.isLoadingMore,
        retry: live.retry,
        datasetKey: `${captureId}:live`,
    }
}

import type { PacketSummary, PacketSummaryBatch } from '@repo/shared/capture'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'

export const PACKET_SUMMARY_PAGE_SIZE = 1_024
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

export function usePacketSummaries(
    captureId: string,
    options: { readonly enabled: boolean; readonly mode: SummaryReadMode },
) {
    const queryClient = useQueryClient()
    const loadMoreInFlight = useRef(false)
    const query = useQuery({
        queryKey: captureKeys.summaries(captureId),
        queryFn: async ({ signal }) => {
            const current =
                queryClient.getQueryData<SummaryState>(captureKeys.summaries(captureId)) ??
                emptySummaryState
            return readPacketSummaryState(
                captureId,
                current,
                options.mode,
                captureClient.summaries,
                signal,
            )
        },
        enabled: options.enabled,
        placeholderData: emptySummaryState,
        staleTime: Infinity,
        structuralSharing: false,
    })
    const state = query.data ?? emptySummaryState
    const { isFetching, refetch } = query
    const loadMore = useCallback(() => {
        if (
            !options.enabled ||
            options.mode !== 'history' ||
            state.complete ||
            isFetching ||
            loadMoreInFlight.current
        )
            return
        loadMoreInFlight.current = true
        void refetch({ cancelRefetch: false }).finally(() => {
            loadMoreInFlight.current = false
        })
    }, [isFetching, options.enabled, options.mode, refetch, state.complete])
    return {
        ...state,
        error: query.error,
        hasMore: options.enabled && options.mode === 'history' && !state.complete,
        isInitialLoading: options.enabled && isFetching && state.rows.length === 0,
        isLoadingMore:
            options.enabled && options.mode === 'history' && isFetching && state.rows.length > 0,
        loadMore,
    }
}

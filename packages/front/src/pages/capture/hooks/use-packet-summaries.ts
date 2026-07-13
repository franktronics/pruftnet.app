import type { PacketSummary, PacketSummaryBatch } from '@repo/shared/capture'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'

export const MAX_PACKET_SUMMARIES = 50_000

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
            // Search backward because monotonically polled batches can only overlap the retained tail.
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
    // Merge only the overlap; the common polling path above goes directly to tail append.
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

export function usePacketSummaries(captureId: string) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: captureKeys.summaries(captureId),
        initialData: emptySummaryState,
        queryFn: async ({ signal }) => {
            let next =
                queryClient.getQueryData<SummaryState>(captureKeys.summaries(captureId)) ??
                emptySummaryState
            do {
                const batch = await captureClient.summaries(captureId, next.cursor)
                if (signal.aborted)
                    throw new DOMException('Packet summary request aborted', 'AbortError')
                next = mergeSummaryBatch(captureId, next, batch)
                queryClient.setQueryData(captureKeys.summaries(captureId), next)
                if (batch.captureComplete || batch.summaries.length < 1024) break
            } while (!signal.aborted)
            return next
        },
        refetchInterval: (current) => (current.state.data?.complete ? false : 500),
        staleTime: 0,
    })
    return { ...(query.data ?? emptySummaryState), error: query.error, isPending: query.isPending }
}

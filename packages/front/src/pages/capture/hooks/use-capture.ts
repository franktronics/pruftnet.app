import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { CaptureEvent, CaptureEventBatch, LiveCaptureSource } from '@repo/shared/capture'

import { captureClient } from '#front/pages/capture/api/capture-client'
import {
    captureKeys,
    captureInterfacesOptions,
    captureSessionOptions,
    captureStatsOptions,
    registryOptions,
} from '#front/pages/capture/api/capture-queries'

export const useCaptureSession = (captureId: string) => useQuery(captureSessionOptions(captureId))
export const useCaptureInterfaces = () => useQuery(captureInterfacesOptions())
const isTerminal = (state: string | undefined) =>
    state === 'stopped' || state === 'completed' || state === 'failed'
export function useCaptureStats(captureId: string, state?: string) {
    const query = useQuery(captureStatsOptions(captureId, isTerminal(state)))
    const lastFinalState = useRef<string | undefined>(undefined)
    const refetch = query.refetch
    useEffect(() => {
        if (!isTerminal(state) || lastFinalState.current === state) return
        lastFinalState.current = state
        void refetch()
    }, [state, refetch])
    return query
}
export const useCaptureRegistry = (revision: string | undefined) =>
    useQuery({ ...registryOptions(revision ?? ''), enabled: Boolean(revision) })

export function useStartReplayCapture() {
    return useMutation({ mutationFn: captureClient.startReplay })
}

export function useStartLiveCapture() {
    return useMutation({
        mutationFn: (source: LiveCaptureSource) => captureClient.startLive(source),
    })
}

export function useStopCapture(captureId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => captureClient.stop(captureId),
        onSuccess: (session) => queryClient.setQueryData(captureKeys.session(captureId), session),
    })
}

export function mergeCaptureEvents(
    captureId: string,
    current: readonly CaptureEvent[],
    batch: CaptureEventBatch,
): readonly CaptureEvent[] {
    if (batch.captureId !== captureId) return current
    const byCursor = new Map(current.map((event) => [event.cursor, event]))
    for (const event of batch.events) byCursor.set(event.cursor, event)
    return [...byCursor.values()].sort((a, b) => {
        const left = BigInt(a.cursor)
        const right = BigInt(b.cursor)
        return left < right ? -1 : left > right ? 1 : 0
    })
}

export const MAX_CAPTURE_EVENTS = 1_000
export interface CaptureEventState {
    readonly events: readonly CaptureEvent[]
    readonly cursor?: string
    readonly gap: boolean
}

export function mergeCaptureEventBatch(
    captureId: string,
    current: CaptureEventState,
    batch: CaptureEventBatch,
): CaptureEventState {
    if (batch.captureId !== captureId) return current
    const merged = mergeCaptureEvents(captureId, current.events, batch)
    const dropped = merged.length > MAX_CAPTURE_EVENTS
    return {
        events: dropped ? merged.slice(-MAX_CAPTURE_EVENTS) : merged,
        cursor: batch.events.at(-1)?.cursor ?? current.cursor,
        gap: current.gap || batch.gapBeforeFirst || dropped,
    }
}

export function useCaptureEvents(captureId: string, state?: string) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: captureKeys.events(captureId),
        queryFn: async ({ queryKey }) => {
            const current = queryClient.getQueryData<CaptureEventState>(
                captureKeys.events(captureId),
            ) ?? { events: [], gap: false }
            const batch = await captureClient.events(captureId, current.cursor)
            if (batch.captureId !== queryKey[1]) throw new Error('Stale capture event batch')
            return mergeCaptureEventBatch(captureId, current, batch)
        },
        refetchInterval: isTerminal(state) ? false : 1_000,
    })
    const lastFinalState = useRef<string | undefined>(undefined)
    const refetch = query.refetch
    useEffect(() => {
        if (!isTerminal(state) || lastFinalState.current === state) return
        lastFinalState.current = state
        void refetch()
    }, [state, refetch])
    return query
}

import {
    CaptureStatSampleList,
    type CaptureStatSample,
    type CaptureStats,
} from '@repo/shared/capture'
import type { CaptureChange } from '@repo/shared/realtime'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { subscribeRpcStream } from '#front/config/effect-runtime'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'
import { hasSequenceGap, heartbeatRequiresReconciliation } from '#front/realtime/stream-sequence'

function mergeSample(
    current: CaptureStatSampleList | undefined,
    sample: CaptureStatSample,
): CaptureStatSampleList {
    const byTimestamp = new Map((current?.samples ?? []).map((item) => [item.sampledAtNs, item]))
    byTimestamp.set(sample.sampledAtNs, sample)
    const samples = [...byTimestamp.values()]
        .sort((left, right) => {
            const leftTime = BigInt(left.sampledAtNs)
            const rightTime = BigInt(right.sampledAtNs)
            return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : 0
        })
        .slice(-1_000)
    return new CaptureStatSampleList({ samples })
}

export function useCaptureRealtime(captureId: string, enabled: boolean) {
    const queryClient = useQueryClient()

    useEffect(() => {
        if (!enabled) return
        let disposed = false
        let instanceId: string | undefined
        let lastSequence = 0n
        let reconciliation = 0
        let reconciling = false
        let buffered: CaptureChange[] = []
        let summaryCursor: string | null = null
        let eventCursor: string | null = null

        const refreshData = (nextSummary: string | null, nextEvent: string | null) => {
            if (nextSummary && nextSummary !== summaryCursor) {
                summaryCursor = nextSummary
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.summaries(captureId),
                })
            }
            if (nextEvent && nextEvent !== eventCursor) {
                eventCursor = nextEvent
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.events(captureId),
                })
            }
        }

        const apply = (change: CaptureChange) => {
            if (change._tag === 'CaptureDataAvailable') {
                refreshData(change.summaryCursor, change.eventCursor)
                return
            }
            if (change._tag !== 'CaptureLiveSnapshot') return
            queryClient.setQueryData(captureKeys.session(captureId), change.session)
            if (change.stats) {
                queryClient.setQueryData<CaptureStats>(captureKeys.stats(captureId), change.stats)
            }
            if (change.statSample) {
                queryClient.setQueryData<CaptureStatSampleList>(
                    captureKeys.statSamples(captureId),
                    (current) => mergeSample(current, change.statSample!),
                )
            }
            refreshData(change.summaryCursor, change.eventCursor)
            if (change.terminal) {
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.summaries(captureId),
                })
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.events(captureId),
                })
            }
        }

        const reconcile = () => {
            const token = ++reconciliation
            reconciling = true
            buffered = []
            void Promise.allSettled([
                captureClient.session(captureId),
                captureClient.stats(captureId),
                captureClient.statSamples(captureId),
            ]).then(([session, stats, samples]) => {
                if (disposed || token !== reconciliation) return
                if (session.status === 'fulfilled') {
                    queryClient.setQueryData(captureKeys.session(captureId), session.value)
                }
                if (stats.status === 'fulfilled') {
                    queryClient.setQueryData(captureKeys.stats(captureId), stats.value)
                }
                if (samples.status === 'fulfilled') {
                    queryClient.setQueryData(captureKeys.statSamples(captureId), samples.value)
                }
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.summaries(captureId),
                })
                void queryClient.invalidateQueries({
                    queryKey: captureKeys.events(captureId),
                })
                for (const change of buffered) apply(change)
                buffered = []
                reconciling = false
            })
        }

        const onValue = (change: CaptureChange) => {
            if (change._tag === 'CaptureStreamReady') {
                instanceId = change.instanceId
                lastSequence = BigInt(change.sequence)
                reconcile()
                return
            }
            if (change._tag === 'CaptureHeartbeat') {
                const sequence = BigInt(change.sequence)
                if (
                    heartbeatRequiresReconciliation(
                        instanceId,
                        lastSequence,
                        change.instanceId,
                        sequence,
                    )
                ) {
                    instanceId = change.instanceId
                    reconcile()
                }
                if (sequence > lastSequence) lastSequence = sequence
                return
            }
            const sequence = BigInt(change.sequence)
            const gap = hasSequenceGap(lastSequence, sequence)
            if (sequence > lastSequence) lastSequence = sequence
            if (gap) reconcile()
            if (reconciling) buffered.push(change)
            else apply(change)
        }

        const unsubscribe = subscribeRpcStream<CaptureChange>({
            stream: (client) => client.WatchCaptureChanges({ captureId }),
            onValue,
        })
        return () => {
            disposed = true
            reconciliation += 1
            unsubscribe()
        }
    }, [captureId, enabled, queryClient])
}

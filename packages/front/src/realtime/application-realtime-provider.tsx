import type { CaptureRecord, CaptureRecordList, ExportJobList } from '@repo/shared/capture'
import type { ApplicationChange } from '@repo/shared/realtime'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

import { subscribeRpcStream } from '#front/config/effect-runtime'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'

import { normalizeExportJobs, sortCaptures } from './application-cache'
import { hasSequenceGap, heartbeatRequiresReconciliation } from './stream-sequence'

const activeStates = new Set(['preparing', 'capturing', 'stopping'])

export function ApplicationRealtimeProvider({ children }: { readonly children: ReactNode }) {
    const queryClient = useQueryClient()

    useEffect(() => {
        let disposed = false
        let instanceId: string | undefined
        let lastSequence = 0n
        let reconciliation = 0
        let reconciling = false
        let buffered: ApplicationChange[] = []

        const apply = (change: ApplicationChange) => {
            switch (change._tag) {
                case 'CaptureRecordChanged': {
                    const capture = change.capture
                    queryClient.setQueryData<CaptureRecordList>(
                        captureKeys.history(),
                        (current) => ({
                            captures: sortCaptures([
                                ...(current?.captures.filter(
                                    (item) => item.captureId !== capture.captureId,
                                ) ?? []),
                                capture,
                            ]),
                        }),
                    )
                    queryClient.setQueryData(
                        ['capture', capture.captureId, 'titlebar-record'],
                        capture,
                    )
                    queryClient.setQueryData<CaptureRecord | null>(
                        captureKeys.active(),
                        (current) =>
                            activeStates.has(capture.state)
                                ? capture
                                : current?.captureId === capture.captureId
                                  ? null
                                  : (current ?? null),
                    )
                    return
                }
                case 'CaptureRecordDeleted':
                    queryClient.setQueryData<CaptureRecordList>(
                        captureKeys.history(),
                        (current) => ({
                            captures:
                                current?.captures.filter(
                                    (capture) => capture.captureId !== change.captureId,
                                ) ?? [],
                        }),
                    )
                    queryClient.setQueryData<CaptureRecord | null>(
                        captureKeys.active(),
                        (current) =>
                            current?.captureId === change.captureId ? null : (current ?? null),
                    )
                    queryClient.removeQueries({
                        queryKey: ['capture', change.captureId, 'titlebar-record'],
                        exact: true,
                    })
                    return
                case 'ExportJobChanged':
                    queryClient.setQueryData<ExportJobList>(
                        captureKeys.exportJobs(),
                        (current) => ({
                            exports: normalizeExportJobs([
                                change.job,
                                ...(current?.exports.filter(
                                    (job) => job.exportId !== change.job.exportId,
                                ) ?? []),
                            ]),
                        }),
                    )
                    return
                default:
                    return
            }
        }

        const reconcile = () => {
            const token = ++reconciliation
            reconciling = true
            buffered = []
            void Promise.all([
                captureClient.captures(),
                captureClient.activeCapture(),
                captureClient.exportJobs(),
            ])
                .then(([captures, active, exports]) => {
                    if (disposed || token !== reconciliation) return
                    queryClient.setQueryData(captureKeys.history(), captures)
                    queryClient.setQueryData(captureKeys.active(), active)
                    queryClient.setQueryData(captureKeys.exportJobs(), exports)
                    for (const change of buffered) apply(change)
                    buffered = []
                    reconciling = false
                })
                .catch(() => {
                    if (disposed || token !== reconciliation) return
                    for (const change of buffered) apply(change)
                    buffered = []
                    reconciling = false
                })
        }

        const onValue = (change: ApplicationChange) => {
            if (change._tag === 'ApplicationStreamReady') {
                instanceId = change.instanceId
                lastSequence = BigInt(change.sequence)
                reconcile()
                return
            }
            if (change._tag === 'ApplicationHeartbeat') {
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

        const unsubscribe = subscribeRpcStream<ApplicationChange>({
            stream: (client) => client.WatchApplicationChanges(),
            onValue,
        })
        return () => {
            disposed = true
            reconciliation += 1
            unsubscribe()
        }
    }, [queryClient])

    return children
}

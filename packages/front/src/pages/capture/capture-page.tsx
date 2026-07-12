import { useNavigate, useParams } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/molecules'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@repo/ui/organisms'

import { CaptureStatsPanel } from './components/capture-stats'
import { captureKeys } from './api/capture-queries'
import { PacketBytes } from './components/packet-bytes'
import { PacketTable } from './components/packet-table'
import { PacketTree } from './components/packet-tree'
import { ReplayToolbar } from './components/replay-toolbar'
import {
    useCaptureEvents,
    useCaptureRegistry,
    useCaptureSession,
    useCaptureStats,
    useStartReplayCapture,
    useStopCapture,
} from './hooks/use-capture'
import { packetDetailState, usePacketDetail } from './hooks/use-packet-detail'
import { usePacketSummaries, type SummaryRow } from './hooks/use-packet-summaries'
import { deepestNodeAtByte, nodeRange, packetKey } from './model/packet-view'

export function CapturePage() {
    const { captureId } = useParams({ from: '/capture/$captureId' })
    return <CaptureWorkspace key={captureId} captureId={captureId} />
}

function CaptureWorkspace({ captureId }: { captureId: string }) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const session = useCaptureSession(captureId)
    const stats = useCaptureStats(captureId, session.data?.state)
    const summaries = usePacketSummaries(captureId)
    const registry = useCaptureRegistry(session.data?.registryRevision ?? '')
    const stop = useStopCapture(captureId)
    const restart = useStartReplayCapture()
    const events = useCaptureEvents(captureId, session.data?.state)
    const [selected, setSelected] = useState<Extract<SummaryRow, { kind: 'packet' }>>()
    const [nodeSelection, setNodeSelection] = useState<{ packet: string; index: number }>()
    const [following, setFollowing] = useState(true)
    const detail = usePacketDetail(
        captureId,
        selected?.summary.key.packetId,
        selected?.summary.analysisRevision,
        registry.data,
    )
    const detailModel = packetDetailState(
        selected?.summary.key.packetId,
        detail.isPending,
        detail.data,
        detail.error,
    )
    const eventWarning = events.data?.events.findLast(
        (event) =>
            event.severity === 'warning' ||
            event.severity === 'error' ||
            event.severity === 'fatal',
    )

    async function handleRestart() {
        if (session.data?.source._tag !== 'Replay') return
        try {
            const next = await restart.mutateAsync(session.data.source.fileId)
            queryClient.setQueryData(captureKeys.session(next.captureId), next)
            queryClient.removeQueries({ queryKey: [...captureKeys.all, captureId] })
            await navigate({ to: '/capture/$captureId', params: { captureId: next.captureId } })
        } catch {
            /* Mutation state renders the failure. */
        }
    }
    function handleSelect(row: Extract<SummaryRow, { kind: 'packet' }>) {
        setSelected(row)
        setFollowing(false)
    }
    const selectedKey = selected ? packetKey(selected.summary) : undefined
    const selectedNode =
        selectedKey && nodeSelection?.packet === selectedKey
            ? nodeSelection.index
            : detail.data
              ? 0
              : undefined
    const selectNode = (index: number) =>
        selectedKey && setNodeSelection({ packet: selectedKey, index })
    const range =
        detail.data && selectedNode !== undefined ? nodeRange(detail.data, selectedNode) : undefined
    const selectByte = (sourceId: number, offset: number) => {
        if (!detail.data) return
        const index = deepestNodeAtByte(detail.data, sourceId, offset)
        if (index !== undefined) selectNode(index)
    }

    return (
        <div
            className="bg-border flex h-full min-h-0 flex-col overflow-hidden"
            data-capture-id={captureId}
        >
            <ReplayToolbar
                captureId={captureId}
                state={session.data?.state}
                following={following}
                onFollowingChange={setFollowing}
                onStop={() => stop.mutate()}
                onRestart={() => void handleRestart()}
                stopping={stop.isPending}
                restarting={restart.isPending}
                error={restart.error ?? session.error}
                warning={
                    events.data?.gap
                        ? 'Some capture events are no longer retained.'
                        : events.error
                          ? 'Capture events are unavailable.'
                          : eventWarning?.message
                }
            />
            <div className="hidden min-h-0 flex-1 md:block">
                <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel defaultSize="58%" minSize="30%">
                        <ResizablePanelGroup orientation="horizontal">
                            <ResizablePanel defaultSize="74%" minSize="45%">
                                <PacketTable
                                    rows={summaries.rows}
                                    originTimestampNs={summaries.originTimestampNs}
                                    selectedKey={selectedKey}
                                    onSelect={handleSelect}
                                    following={following}
                                    onPauseFollowing={() => setFollowing(false)}
                                />
                            </ResizablePanel>
                            <ResizableHandle />
                            <ResizablePanel defaultSize="26%" minSize="18%">
                                <CaptureStatsPanel stats={stats.data} state={session.data?.state} />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel defaultSize="42%" minSize="22%">
                        <ResizablePanelGroup orientation="horizontal">
                            <ResizablePanel defaultSize="44%" minSize="25%">
                                <PacketTree
                                    key={selectedKey}
                                    detail={detail.data}
                                    registry={registry.data}
                                    detailState={detailModel}
                                    selected={selectedNode}
                                    onSelect={selectNode}
                                />
                            </ResizablePanel>
                            <ResizableHandle />
                            <ResizablePanel defaultSize="56%" minSize="30%">
                                <PacketBytes
                                    detail={detail.data}
                                    detailState={detailModel}
                                    range={range}
                                    onSelectByte={selectByte}
                                />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
                <div className="min-h-0 flex-[3]">
                    <PacketTable
                        rows={summaries.rows}
                        originTimestampNs={summaries.originTimestampNs}
                        selectedKey={selectedKey}
                        onSelect={handleSelect}
                        following={following}
                        onPauseFollowing={() => setFollowing(false)}
                    />
                </div>
                <Tabs
                    defaultValue="structure"
                    className="bg-background min-h-0 flex-[2] gap-0 border-t"
                >
                    <TabsList className="h-9 w-full rounded-none border-b bg-transparent p-0">
                        <TabsTrigger value="stats">Stats</TabsTrigger>
                        <TabsTrigger value="structure">Structure</TabsTrigger>
                        <TabsTrigger value="bytes">Bytes</TabsTrigger>
                    </TabsList>
                    <TabsContent value="stats" className="min-h-0 flex-1">
                        <CaptureStatsPanel stats={stats.data} state={session.data?.state} />
                    </TabsContent>
                    <TabsContent value="structure" className="min-h-0 flex-1">
                        <PacketTree
                            key={selectedKey}
                            detail={detail.data}
                            registry={registry.data}
                            detailState={detailModel}
                            selected={selectedNode}
                            onSelect={selectNode}
                        />
                    </TabsContent>
                    <TabsContent value="bytes" className="min-h-0 flex-1">
                        <PacketBytes
                            detail={detail.data}
                            detailState={detailModel}
                            range={range}
                            onSelectByte={selectByte}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

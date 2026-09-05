import { useParams } from '@tanstack/react-router'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'

import { useIsMobile } from '@repo/ui/hooks'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/molecules'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@repo/ui/organisms'

import { CaptureStatsPanel } from './components/capture-stats'
import { CaptureControlBar } from './components/capture-control-bar'
import { DisplayFilter } from './components/display-filter'
import { PacketBytes } from './components/packet-bytes'
import { PacketTable } from './components/packet-table'
import { PacketTree } from './components/packet-tree'
import {
    useCaptureRegistry,
    useCaptureSession,
    useCaptureStatSamples,
    useCaptureStats,
} from './hooks/use-capture'
import { packetDetailState, usePacketDetail } from './hooks/use-packet-detail'
import { usePacketSummaries, type SummaryRow } from './hooks/use-packet-summaries'
import { useCaptureRealtime } from './hooks/use-capture-realtime'
import {
    countAdvancedPacketFilters,
    emptyPacketDisplayFilters,
    filterPacketRows,
    relativeSecondsNumber,
    toPacketSummaryFilter,
    type PacketDisplayFilters,
} from './model/packet-filters'
import { deepestNodeAtByte, nodeRange, packetKey } from './model/packet-view'
import { BasicErrorAlert } from '#front/components/error-renderer'

export function CapturePage() {
    const { captureId } = useParams({ from: '/capture/$captureId' })
    return <CaptureWorkspace key={captureId} captureId={captureId} />
}

function CaptureWorkspace({ captureId }: { captureId: string }) {
    const isMobile = useIsMobile()
    const session = useCaptureSession(captureId)
    const terminal =
        session.data?.state === 'stopped' ||
        session.data?.state === 'completed' ||
        session.data?.state === 'failed'
    useCaptureRealtime(captureId, session.isSuccess && !terminal)
    const stats = useCaptureStats(captureId)
    const statSamples = useCaptureStatSamples(captureId)
    const [filters, setFilters] = useState<PacketDisplayFilters>(emptyPacketDisplayFilters)
    const deferredFilters = useDeferredValue(filters)
    const historicalFilter = useMemo(
        () => (terminal ? toPacketSummaryFilter(deferredFilters) : null),
        [deferredFilters, terminal],
    )
    const [following, setFollowing] = useState(true)
    const summaries = usePacketSummaries(captureId, {
        enabled: session.isSuccess,
        mode: terminal ? 'history' : 'live',
        paused: !following,
        filter: historicalFilter,
    })
    const registry = useCaptureRegistry(session.data?.registryRevision ?? '')
    const [selected, setSelected] = useState<{
        readonly row: Extract<SummaryRow, { kind: 'packet' }>
        readonly index: number
    }>()
    const [nodeSelection, setNodeSelection] = useState<{ packet: string; index: number }>()
    const detail = usePacketDetail(
        captureId,
        selected?.row.summary.key.packetId,
        selected?.row.summary.analysisRevision,
        registry.data,
    )
    const detailModel = packetDetailState(
        selected?.row.summary.key.packetId,
        detail.isPending,
        detail.data,
        detail.error,
    )
    const visibleLiveRows = useMemo(
        () =>
            summaries.mode === 'live'
                ? filterPacketRows(summaries.rows, deferredFilters, summaries.originTimestampNs)
                : [],
        [deferredFilters, summaries.mode, summaries.originTimestampNs, summaries.rows],
    )
    const getTableRow = useCallback(
        (index: number) =>
            summaries.mode === 'history' ? summaries.getRow(index) : visibleLiveRows[index],
        [summaries, visibleLiveRows],
    )
    const tableRowCount = summaries.mode === 'history' ? summaries.rowCount : visibleLiveRows.length
    const totalPacketCount = summaries.totalRowCount
    const visiblePacketCount =
        summaries.mode === 'history'
            ? summaries.packetRowCount
            : visibleLiveRows.length - Number(visibleLiveRows[0]?.kind === 'gap')
    const maxTimeSeconds = useMemo(() => {
        if (!summaries.originTimestampNs) return 0
        return summaries.lastTimestampNs
            ? relativeSecondsNumber(summaries.lastTimestampNs, summaries.originTimestampNs)
            : 0
    }, [summaries.lastTimestampNs, summaries.originTimestampNs])
    const displayInterfaces = useMemo(
        () =>
            session.data?.source._tag === 'Live'
                ? session.data.source.interfaces.map((item, id) => ({ id, name: item.name }))
                : [],
        [session.data],
    )
    const hasActiveFilter = filters.search.trim() !== '' || countAdvancedPacketFilters(filters) > 0
    const emptyMessage = summaries.error
        ? 'Packet summaries could not be loaded.'
        : summaries.isInitialLoading
          ? 'Waiting for packet summaries...'
          : hasActiveFilter && visiblePacketCount === 0
            ? 'No packets match the current filters.'
            : session.data?.state === 'running' || session.data?.state === 'starting'
              ? 'Waiting for packets...'
              : 'No packets were captured.'

    const handleSelect = useCallback(
        (row: Extract<SummaryRow, { kind: 'packet' }>, index: number) => {
            setSelected({ row, index })
            setFollowing(false)
        },
        [],
    )
    const pauseFollowing = useCallback(() => setFollowing(false), [])

    if (session.isPending) {
        return (
            <div className="bg-background grid h-full place-items-center" role="status">
                <p className="text-muted-foreground text-sm">Loading capture session...</p>
            </div>
        )
    }
    if (session.error) {
        return (
            <div className="bg-background h-full p-6">
                <BasicErrorAlert error={session.error} onRetry={() => void session.refetch()} />
            </div>
        )
    }

    function updateFilters(next: PacketDisplayFilters) {
        setFilters(next)
        if (terminal) {
            setSelected(undefined)
            setNodeSelection(undefined)
            return
        }
        if (
            selected &&
            !filterPacketRows(summaries.rows, next, summaries.originTimestampNs).some(
                (row) =>
                    row.kind === 'packet' &&
                    packetKey(row.summary) === packetKey(selected.row.summary),
            )
        ) {
            setSelected(undefined)
            setNodeSelection(undefined)
        }
    }
    const selectedKey = selected ? packetKey(selected.row.summary) : undefined
    const liveSelectedIndex =
        selected && summaries.mode === 'live'
            ? visibleLiveRows.findIndex(
                  (row) =>
                      row.kind === 'packet' &&
                      packetKey(row.summary) === packetKey(selected.row.summary),
              )
            : -1
    const selectedIndex =
        summaries.mode === 'history'
            ? selected?.index
            : liveSelectedIndex >= 0
              ? liveSelectedIndex
              : undefined
    const selectedNode =
        selectedKey && nodeSelection?.packet === selectedKey ? nodeSelection.index : undefined
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
            <CaptureControlBar session={session.data} />
            <DisplayFilter
                value={filters.search}
                onChange={(search) => updateFilters({ ...filters, search })}
                filters={filters}
                onFiltersChange={updateFilters}
                protocols={registry.data?.protocols ?? []}
                interfaces={displayInterfaces}
                maxTimeSeconds={maxTimeSeconds}
                visibleCount={visiblePacketCount}
                totalCount={totalPacketCount}
                counting={summaries.indexing}
            />
            {!isMobile && (
                <div className="hidden min-h-0 flex-1 md:block">
                    <ResizablePanelGroup orientation="vertical">
                        <ResizablePanel defaultSize="58%" minSize="30%">
                            <ResizablePanelGroup orientation="horizontal">
                                <ResizablePanel defaultSize="74%" minSize="45%">
                                    <PacketTable
                                        rowCount={tableRowCount}
                                        packetCount={visiblePacketCount}
                                        getRow={getTableRow}
                                        originTimestampNs={summaries.originTimestampNs}
                                        selectedKey={selectedKey}
                                        selectedIndex={selectedIndex}
                                        onSelect={handleSelect}
                                        following={!terminal && following}
                                        canFollow={!terminal}
                                        onFollowingChange={setFollowing}
                                        onPauseFollowing={pauseFollowing}
                                        onVisibleRangeChange={summaries.requestRange}
                                        loadError={summaries.error}
                                        onRetry={() => void summaries.retry()}
                                        emptyMessage={emptyMessage}
                                        datasetKey={summaries.datasetKey}
                                    />
                                </ResizablePanel>
                                <ResizableHandle />
                                <ResizablePanel defaultSize="26%" minSize="18%">
                                    <CaptureStatsPanel
                                        stats={stats.data}
                                        durableSamples={statSamples.data?.samples}
                                        state={session.data?.state}
                                    />
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
            )}
            {isMobile && (
                <div className="flex min-h-0 flex-1 flex-col md:hidden">
                    <div className="min-h-0 flex-3">
                        <PacketTable
                            rowCount={tableRowCount}
                            packetCount={visiblePacketCount}
                            getRow={getTableRow}
                            originTimestampNs={summaries.originTimestampNs}
                            selectedKey={selectedKey}
                            selectedIndex={selectedIndex}
                            onSelect={handleSelect}
                            following={!terminal && following}
                            canFollow={!terminal}
                            onFollowingChange={setFollowing}
                            onPauseFollowing={pauseFollowing}
                            onVisibleRangeChange={summaries.requestRange}
                            loadError={summaries.error}
                            onRetry={() => void summaries.retry()}
                            emptyMessage={emptyMessage}
                            datasetKey={summaries.datasetKey}
                        />
                    </div>
                    <Tabs
                        defaultValue="structure"
                        className="bg-background min-h-0 flex-2 gap-0 border-t"
                    >
                        <TabsList className="h-9 w-full rounded-none border-b bg-transparent p-0">
                            <TabsTrigger value="stats">Stats</TabsTrigger>
                            <TabsTrigger value="structure">Structure</TabsTrigger>
                            <TabsTrigger value="bytes">Bytes</TabsTrigger>
                        </TabsList>
                        <TabsContent value="stats" className="min-h-0 flex-1">
                            <CaptureStatsPanel
                                stats={stats.data}
                                durableSamples={statSamples.data?.samples}
                                state={session.data?.state}
                            />
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
            )}
        </div>
    )
}

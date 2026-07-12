import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'

import type { SummaryRow } from '../hooks/use-packet-summaries'
import {
    PACKET_ROW_HEIGHT,
    packetKey,
    relativePacketTime,
    summaryColumn,
} from '../model/packet-view'
import { PanelShell } from './panel-shell'

const grid = 'grid-cols-[64px_82px_minmax(100px,1fr)_minmax(100px,1fr)_86px_70px_minmax(180px,2fr)]'

export function PacketTable({
    rows,
    selectedKey,
    onSelect,
    following,
    onPauseFollowing,
    originTimestampNs,
    emptyMessage,
}: {
    rows: readonly SummaryRow[]
    selectedKey?: string
    onSelect: (row: Extract<SummaryRow, { kind: 'packet' }>) => void
    following: boolean
    onPauseFollowing: () => void
    originTimestampNs?: string
    emptyMessage?: string
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => PACKET_ROW_HEIGHT,
        overscan: 12,
        getItemKey: (index) =>
            rows[index]?.kind === 'packet' ? packetKey(rows[index].summary) : `gap-${index}`,
    })
    useEffect(() => {
        if (following && rows.length > 0)
            virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
    }, [following, rows.length, virtualizer])

    function moveSelection(delta: number) {
        const current = rows.findIndex(
            (row) => row.kind === 'packet' && packetKey(row.summary) === selectedKey,
        )
        const origin = current < 0 ? (delta > 0 ? -1 : rows.length) : current
        let index = Math.max(0, Math.min(rows.length - 1, origin + delta))
        while (rows[index]?.kind !== 'packet' && index >= 0 && index < rows.length)
            index += delta > 0 ? 1 : -1
        const row = rows[index]
        if (row?.kind === 'packet') {
            onSelect(row)
            virtualizer.scrollToIndex(index, { align: 'auto' })
        }
    }

    return (
        <PanelShell
            title="Packets"
            meta={`${rows.filter((row) => row.kind === 'packet').length.toLocaleString()} retained`}
        >
            <div
                ref={scrollRef}
                className="focus-visible:ring-ring h-full overflow-auto focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                role="grid"
                tabIndex={0}
                aria-label="Captured packets"
                aria-activedescendant={
                    selectedKey &&
                    virtualizer.getVirtualItems().some((item) => {
                        const row = rows[item.index]
                        return row?.kind === 'packet' && packetKey(row.summary) === selectedKey
                    })
                        ? `packet-row-${selectedKey}`
                        : undefined
                }
                onScroll={(event) => {
                    const target = event.currentTarget
                    if (
                        following &&
                        target.scrollHeight - target.scrollTop - target.clientHeight > 2
                    )
                        onPauseFollowing()
                }}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault()
                        moveSelection(event.key === 'ArrowDown' ? 1 : -1)
                    }
                }}
            >
                <div
                    role="row"
                    className={`bg-muted text-muted-foreground sticky top-0 z-10 grid h-8 min-w-max items-center border-b px-2 text-xs font-semibold tracking-wide uppercase ${grid}`}
                >
                    <span role="columnheader">No.</span>
                    <span role="columnheader">Time</span>
                    <span role="columnheader">Source</span>
                    <span role="columnheader">Destination</span>
                    <span role="columnheader">Protocol</span>
                    <span role="columnheader" className="text-right">
                        Length
                    </span>
                    <span role="columnheader" className="pl-3">
                        Info
                    </span>
                </div>
                <div className="relative min-w-max" style={{ height: virtualizer.getTotalSize() }}>
                    {rows.length === 0 && emptyMessage ? (
                        <div
                            className="text-muted-foreground absolute inset-x-0 top-14 text-center text-xs"
                            role="status"
                        >
                            {emptyMessage}
                        </div>
                    ) : null}
                    {virtualizer.getVirtualItems().map((item) => {
                        const row = rows[item.index]
                        if (!row) return null
                        if (row.kind === 'gap')
                            return (
                                <div
                                    key={item.key}
                                    className="text-muted-foreground absolute top-0 left-0 flex w-full items-center border-b border-dashed px-3 text-xs italic"
                                    style={{
                                        height: item.size,
                                        transform: `translateY(${item.start}px)`,
                                    }}
                                >
                                    Earlier packets are no longer retained
                                </div>
                            )
                        const summary = row.summary
                        const selected = packetKey(summary) === selectedKey
                        return (
                            <div
                                key={item.key}
                                id={`packet-row-${packetKey(summary)}`}
                                role="row"
                                aria-selected={selected}
                                onClick={() => onSelect(row)}
                                className={`absolute top-0 left-0 grid w-full cursor-default items-center border-b px-2 font-mono text-xs tabular-nums ${grid} ${selected ? 'bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-muted/45'} ${summary.parseCondition === 'malformed' ? 'text-destructive' : summary.parseCondition !== 'complete' ? 'text-amber-700 dark:text-amber-400' : ''}`}
                                style={{
                                    height: item.size,
                                    transform: `translateY(${item.start}px)`,
                                }}
                            >
                                <span role="gridcell">{summary.key.packetId}</span>
                                <span role="gridcell">
                                    {originTimestampNs
                                        ? relativePacketTime(summary.timestampNs, originTimestampNs)
                                        : '0.000000'}
                                </span>
                                <span role="gridcell" className="truncate">
                                    {summaryColumn(summary, 'source')}
                                </span>
                                <span role="gridcell" className="truncate">
                                    {summaryColumn(summary, 'destination')}
                                </span>
                                <span role="gridcell" className="truncate font-sans font-medium">
                                    {summaryColumn(summary, 'protocol')}
                                </span>
                                <span role="gridcell" className="text-right">
                                    {summaryColumn(summary, 'length') || summary.capturedLength}
                                </span>
                                <span role="gridcell" className="truncate pl-3 font-sans">
                                    {summaryColumn(summary, 'info')}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </PanelShell>
    )
}

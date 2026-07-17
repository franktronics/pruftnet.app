import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ArrowDownToLine, ArrowUpToLine } from 'lucide-react'
import { Button } from '@repo/ui/atoms'

import type { SummaryRow } from '#front/pages/capture/hooks/use-packet-summaries'
import {
    PACKET_ROW_HEIGHT,
    packetKey,
    relativePacketTime,
    summaryColumn,
} from '#front/pages/capture/model/packet-view'
import { PanelShell } from './panel-shell'

const columns = [
    { id: 'number', label: 'No.', width: 64, minWidth: 48 },
    { id: 'time', label: 'Time', width: 82, minWidth: 64 },
    { id: 'source', label: 'Source', width: 180, minWidth: 100 },
    { id: 'destination', label: 'Destination', width: 180, minWidth: 100 },
    { id: 'protocol', label: 'Protocol', width: 86, minWidth: 72 },
    { id: 'length', label: 'Length', width: 70, minWidth: 56 },
    { id: 'info', label: 'Info', width: 360, minWidth: 180 },
] as const

const initialColumnWidths: number[] = columns.map((column) => column.width)
const initialTableWidth = initialColumnWidths.reduce((total, width) => total + width, 0)

export function PacketTable({
    rows,
    selectedKey,
    onSelect,
    following,
    onFollowingChange,
    onPauseFollowing,
    originTimestampNs,
    emptyMessage,
}: {
    rows: readonly SummaryRow[]
    selectedKey?: string
    onSelect: (row: Extract<SummaryRow, { kind: 'packet' }>) => void
    following: boolean
    onFollowingChange: (following: boolean) => void
    onPauseFollowing: () => void
    originTimestampNs?: string
    emptyMessage?: string
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const headerRef = useRef<HTMLDivElement>(null)
    const tableRef = useRef<HTMLDivElement>(null)
    const hasInitializedColumnWidths = useRef(false)
    const columnResizeRef = useRef<{
        index: number
        pointerId: number
        startX: number
        startWidth: number
    } | null>(null)
    const [columnWidths, setColumnWidths] = useState(initialColumnWidths)
    const packetCount = rows.filter((row) => row.kind === 'packet').length
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
    useEffect(() => {
        const table = tableRef.current
        if (!table) return
        const observer = new ResizeObserver(([entry]) => {
            if (hasInitializedColumnWidths.current || entry.contentRect.width <= 0) return
            hasInitializedColumnWidths.current = true
            const scale = Math.max(1, entry.contentRect.width / initialTableWidth)
            setColumnWidths(initialColumnWidths.map((width) => Math.round(width * scale)))
        })
        observer.observe(table)
        return () => observer.disconnect()
    }, [])

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

    function scrollToTop() {
        if (following) onPauseFollowing()
        virtualizer.scrollToIndex(0, { align: 'start' })
    }

    function followTail() {
        onFollowingChange(true)
        if (rows.length > 0) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
    }

    const gridStyle = {
        gridTemplateColumns: columnWidths.map((width) => `${width}px`).join(' '),
    }
    const tableWidth = columnWidths.reduce((total, width) => total + width, 0)

    function resizeColumn(index: number, change: number) {
        setColumnWidths((current) =>
            current.map((width, columnIndex) =>
                columnIndex === index ? Math.max(columns[index]!.minWidth, width + change) : width,
            ),
        )
    }

    function handleColumnPointerDown(index: number, event: PointerEvent<HTMLSpanElement>) {
        event.preventDefault()
        event.stopPropagation()
        columnResizeRef.current = {
            index,
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: columnWidths[index]!,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
    }

    function handleColumnPointerMove(event: PointerEvent<HTMLSpanElement>) {
        const resize = columnResizeRef.current
        if (!resize || resize.pointerId !== event.pointerId) return
        const width = Math.max(
            columns[resize.index]!.minWidth,
            resize.startWidth + event.clientX - resize.startX,
        )
        setColumnWidths((current) =>
            current.map((currentWidth, index) => (index === resize.index ? width : currentWidth)),
        )
    }

    function finishColumnResize(event: PointerEvent<HTMLSpanElement>) {
        const resize = columnResizeRef.current
        if (!resize || resize.pointerId !== event.pointerId) return
        columnResizeRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId)
    }

    return (
        <PanelShell title="Packets" showHeader={false}>
            <div ref={tableRef} className="relative flex h-full min-h-0 flex-col">
                <div className="relative shrink-0 overflow-hidden">
                    <div
                        ref={headerRef}
                        role="row"
                        className="bg-muted text-muted-foreground grid h-8 w-full items-center border-b text-xs font-semibold tracking-wide uppercase"
                        style={{ ...gridStyle, minWidth: tableWidth }}
                    >
                        {columns.map((column, index) => (
                            <span
                                key={column.id}
                                role="columnheader"
                                className={`relative flex h-full min-w-0 items-center px-2 ${column.id === 'length' ? 'justify-end' : ''}`}
                            >
                                <span className="truncate">{column.label}</span>
                                {index < columns.length - 1 ? (
                                    <span
                                        role="separator"
                                        aria-orientation="vertical"
                                        aria-label={`Resize ${column.label} column`}
                                        tabIndex={0}
                                        className="group absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-1 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-border after:shadow-[0_0_0_1px_color-mix(in_oklab,var(--background)_45%,transparent)] hover:after:bg-primary focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:after:bg-primary"
                                        onPointerDown={(event) => handleColumnPointerDown(index, event)}
                                        onPointerMove={handleColumnPointerMove}
                                        onPointerUp={finishColumnResize}
                                        onPointerCancel={finishColumnResize}
                                        onKeyDown={(event) => {
                                            const step = event.shiftKey ? 24 : 8
                                            if (event.key === 'ArrowRight')
                                                resizeColumn(index, step)
                                            else if (event.key === 'ArrowLeft')
                                                resizeColumn(index, -step)
                                            else return
                                            event.preventDefault()
                                        }}
                                    />
                                ) : null}
                            </span>
                        ))}
                    </div>
                    <div className="bg-muted absolute top-0 right-0 z-30 flex h-8 items-center gap-0.5 border-b border-l px-1 shadow-[-10px_0_12px_var(--muted)]">
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 normal-case"
                            onClick={scrollToTop}
                            disabled={rows.length === 0}
                        >
                            <ArrowUpToLine />
                            Top
                        </Button>
                        <Button
                            size="sm"
                            variant={following ? 'secondary' : 'ghost'}
                            className="h-7 normal-case"
                            onClick={followTail}
                            disabled={rows.length === 0}
                            aria-pressed={following}
                        >
                            <ArrowDownToLine />
                            {following ? 'Following tail' : 'Follow tail'}
                        </Button>
                    </div>
                </div>
                <div
                    ref={scrollRef}
                    className="focus-visible:ring-ring min-h-0 flex-1 overflow-auto focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
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
                        if (headerRef.current)
                            headerRef.current.style.transform = `translateX(${-target.scrollLeft}px)`
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
                        className="relative w-full"
                        style={{ height: virtualizer.getTotalSize(), minWidth: tableWidth }}
                    >
                    {packetCount === 0 && emptyMessage ? (
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
                                className={`absolute top-0 left-0 grid w-full cursor-default items-center border-b font-mono text-xs tabular-nums ${selected ? 'bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-muted/45'} ${summary.parseCondition === 'malformed' ? 'text-destructive' : summary.parseCondition !== 'complete' ? 'text-amber-700 dark:text-amber-400' : ''}`}
                                style={{
                                    ...gridStyle,
                                    height: item.size,
                                    transform: `translateY(${item.start}px)`,
                                }}
                            >
                                <span role="gridcell" className="truncate px-2">{summary.key.packetId}</span>
                                <span role="gridcell" className="truncate px-2">
                                    {originTimestampNs
                                        ? relativePacketTime(summary.timestampNs, originTimestampNs)
                                        : '0.000000'}
                                </span>
                                <span role="gridcell" className="truncate px-2">
                                    {summaryColumn(summary, 'source')}
                                </span>
                                <span role="gridcell" className="truncate px-2">
                                    {summaryColumn(summary, 'destination')}
                                </span>
                                <span role="gridcell" className="truncate px-2 font-sans font-medium">
                                    {summaryColumn(summary, 'protocol')}
                                </span>
                                <span role="gridcell" className="truncate px-2 text-right">
                                    {summaryColumn(summary, 'length') || summary.capturedLength}
                                </span>
                                <span role="gridcell" className="truncate px-2 font-sans">
                                    {summaryColumn(summary, 'info')}
                                </span>
                            </div>
                        )
                    })}
                    </div>
                </div>
            </div>
        </PanelShell>
    )
}

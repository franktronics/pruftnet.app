import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
const noop = () => undefined

export function PacketTable({
    rowCount,
    packetCount,
    getRow,
    selectedKey,
    selectedIndex,
    onSelect,
    following,
    canFollow = true,
    onFollowingChange,
    onPauseFollowing,
    onVisibleRangeChange = noop,
    loadError,
    onRetry = noop,
    originTimestampNs,
    emptyMessage,
    datasetKey,
}: {
    rowCount: number
    packetCount: number
    getRow: (index: number) => SummaryRow | undefined
    selectedKey?: string
    selectedIndex?: number
    onSelect: (row: Extract<SummaryRow, { kind: 'packet' }>, index: number) => void
    following: boolean
    canFollow?: boolean
    onFollowingChange: (following: boolean) => void
    onPauseFollowing: () => void
    onVisibleRangeChange?: (startIndex: number, endIndex: number) => void
    loadError?: unknown
    onRetry?: () => void
    originTimestampNs?: string
    emptyMessage?: string
    datasetKey: string
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
    const pendingSelection = useRef<number | undefined>(undefined)
    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => PACKET_ROW_HEIGHT,
        overscan: 12,
        getItemKey: (index) => `packet-summary-row-${index}`,
    })
    const virtualItems = virtualizer.getVirtualItems()
    useEffect(() => {
        if (following && rowCount > 0) virtualizer.scrollToIndex(rowCount - 1, { align: 'end' })
    }, [following, rowCount, virtualizer])
    useLayoutEffect(() => {
        const first = virtualItems.at(0)?.index
        const last = virtualItems.at(-1)?.index
        if (first !== undefined && last !== undefined) onVisibleRangeChange(first, last)
    }, [onVisibleRangeChange, virtualItems])
    useEffect(() => {
        virtualizer.scrollToIndex(0, { align: 'start' })
    }, [datasetKey, virtualizer])
    useEffect(() => {
        const index = pendingSelection.current
        if (index === undefined) return
        const row = getRow(index)
        if (row?.kind !== 'packet') return
        pendingSelection.current = undefined
        onSelect(row, index)
    }, [getRow, onSelect])
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
        if (rowCount === 0) return
        const origin = selectedIndex ?? (delta > 0 ? -1 : rowCount)
        let index = Math.max(0, Math.min(rowCount - 1, origin + delta))
        let row = getRow(index)
        while (row?.kind === 'gap' && index >= 0 && index < rowCount) {
            index += delta > 0 ? 1 : -1
            row = getRow(index)
        }
        if (index < 0 || index >= rowCount) return
        if (row?.kind === 'packet') {
            onSelect(row, index)
            virtualizer.scrollToIndex(index, { align: 'auto' })
            return
        }
        pendingSelection.current = index
        virtualizer.scrollToIndex(index, { align: 'auto' })
        onVisibleRangeChange(index, index)
    }

    function scrollToTop() {
        if (following) onPauseFollowing()
        virtualizer.scrollToIndex(0, { align: 'start' })
    }

    function followTail() {
        onFollowingChange(true)
        if (rowCount > 0) virtualizer.scrollToIndex(rowCount - 1, { align: 'end' })
    }

    function scrollToBottom() {
        const index = rowCount - 1
        if (index < 0) return
        virtualizer.scrollToIndex(index, { align: 'end' })
        onVisibleRangeChange(index, index)
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
                                        className="group after:bg-border hover:after:bg-primary focus-visible:ring-ring focus-visible:after:bg-primary absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none outline-none after:absolute after:inset-y-1 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:shadow-[0_0_0_1px_color-mix(in_oklab,var(--background)_45%,transparent)] focus-visible:ring-2 focus-visible:ring-inset"
                                        onPointerDown={(event) =>
                                            handleColumnPointerDown(index, event)
                                        }
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
                            disabled={rowCount === 0}
                        >
                            <ArrowUpToLine />
                            Top
                        </Button>
                        {canFollow ? (
                            <Button
                                size="sm"
                                variant={following ? 'secondary' : 'ghost'}
                                className="h-7 normal-case"
                                onClick={followTail}
                                disabled={rowCount === 0}
                                aria-pressed={following}
                            >
                                <ArrowDownToLine />
                                {following ? 'Following tail' : 'Follow tail'}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 normal-case"
                                onClick={scrollToBottom}
                                disabled={rowCount === 0}
                            >
                                <ArrowDownToLine />
                                Bottom
                            </Button>
                        )}
                    </div>
                </div>
                <div
                    ref={scrollRef}
                    className="focus-visible:ring-ring min-h-0 flex-1 overflow-auto focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                    role="grid"
                    aria-rowcount={rowCount}
                    tabIndex={0}
                    aria-label="Captured packets"
                    aria-activedescendant={
                        selectedKey &&
                        virtualizer.getVirtualItems().some((item) => {
                            const row = getRow(item.index)
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
                        } else if (event.key === 'Home' || event.key === 'End') {
                            event.preventDefault()
                            const index = event.key === 'Home' ? 0 : Math.max(0, rowCount - 1)
                            pendingSelection.current = index
                            virtualizer.scrollToIndex(index, {
                                align: event.key === 'Home' ? 'start' : 'end',
                            })
                            onVisibleRangeChange(index, index)
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
                        {virtualItems.map((item) => {
                            const row = getRow(item.index)
                            if (!row)
                                return (
                                    <div
                                        key={item.key}
                                        role="status"
                                        aria-label={`Loading packet row ${item.index + 1}`}
                                        className="text-muted-foreground absolute top-0 left-0 grid w-full items-center border-b px-2 text-xs"
                                        style={{
                                            ...gridStyle,
                                            height: item.size,
                                            transform: `translateY(${item.start}px)`,
                                        }}
                                    >
                                        {loadError ? (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-6 justify-self-start normal-case"
                                                style={{ gridColumn: '1 / -1' }}
                                                onClick={onRetry}
                                            >
                                                Retry this packet range
                                            </Button>
                                        ) : (
                                            columns.map((column, index) => (
                                                <span
                                                    key={column.id}
                                                    aria-hidden="true"
                                                    className={`bg-muted-foreground/10 h-2 rounded-sm ${index === columns.length - 1 ? 'w-3/5' : 'w-2/3'}`}
                                                />
                                            ))
                                        )}
                                    </div>
                                )
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
                                    aria-rowindex={item.index + 1}
                                    aria-selected={selected}
                                    onClick={() => onSelect(row, item.index)}
                                    className={`absolute top-0 left-0 grid w-full cursor-default items-center border-b font-mono text-xs tabular-nums ${selected ? 'bg-accent text-accent-foreground shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-muted/45'} ${summary.parseCondition === 'malformed' ? 'text-destructive' : summary.parseCondition !== 'complete' ? 'text-amber-700 dark:text-amber-400' : ''}`}
                                    style={{
                                        ...gridStyle,
                                        height: item.size,
                                        transform: `translateY(${item.start}px)`,
                                    }}
                                >
                                    <span role="gridcell" className="truncate px-2">
                                        {summary.key.packetId}
                                    </span>
                                    <span role="gridcell" className="truncate px-2">
                                        {originTimestampNs
                                            ? relativePacketTime(
                                                  summary.timestampNs,
                                                  originTimestampNs,
                                              )
                                            : '0.000000'}
                                    </span>
                                    <span role="gridcell" className="truncate px-2">
                                        {summaryColumn(summary, 'source')}
                                    </span>
                                    <span role="gridcell" className="truncate px-2">
                                        {summaryColumn(summary, 'destination')}
                                    </span>
                                    <span
                                        role="gridcell"
                                        className="truncate px-2 font-sans font-medium"
                                    >
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

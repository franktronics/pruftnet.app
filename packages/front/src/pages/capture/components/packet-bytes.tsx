import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import type { ByteRange } from '#front/pages/capture/model/packet-view'
import { BYTE_ROW_WIDTH } from '#front/pages/capture/model/packet-view'
import { PanelShell } from './panel-shell'
import type { PacketDetailState } from '#front/pages/capture/hooks/use-packet-detail'
import type { PacketDetailView } from '#front/pages/capture/model/packet-detail'

export function PacketBytes({
    detail,
    range,
    onSelectByte,
    detailState,
}: {
    detail?: PacketDetailView
    range?: ByteRange
    onSelectByte: (sourceId: number, offset: number) => void
    detailState?: PacketDetailState
}) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const [activeByte, setActiveByte] = useState<number>()
    const [hoveredByte, setHoveredByte] = useState<number>()
    const source =
        detail?.sources.find((candidate) => candidate.id === (range?.sourceId ?? 0)) ??
        detail?.sources.find((candidate) => candidate.id === 0) ??
        detail?.sources[0]
    const sourceId = source?.id ?? 0
    const bytes = source?.bytes ?? new Uint8Array()
    const rowCount = Math.ceil(bytes.length / BYTE_ROW_WIDTH)
    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 24,
        overscan: 16,
    })
    useEffect(() => {
        setActiveByte(undefined)
        setHoveredByte(undefined)
        scrollRef.current?.scrollTo({ top: 0 })
        virtualizer.scrollToIndex(0)
    }, [sourceId, virtualizer])
    useEffect(() => {
        if (range?.sourceId === sourceId)
            virtualizer.scrollToIndex(Math.floor(range.start / BYTE_ROW_WIDTH), { align: 'auto' })
    }, [range, sourceId, virtualizer])
    function select(index: number) {
        setActiveByte(index)
        onSelectByte(sourceId, index)
        virtualizer.scrollToIndex(Math.floor(index / BYTE_ROW_WIDTH), { align: 'auto' })
    }
    function handleKey(event: KeyboardEvent) {
        const delta =
            event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowLeft'
                  ? -1
                  : event.key === 'ArrowDown'
                    ? BYTE_ROW_WIDTH
                    : event.key === 'ArrowUp'
                      ? -BYTE_ROW_WIDTH
                      : 0
        if (!delta && event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const current = activeByte ?? 0
        select(delta ? Math.max(0, Math.min(bytes.length - 1, current + delta)) : current)
    }
    function byteProps(index: number) {
        return {
            onClick: () => select(index),
            onPointerEnter: () => setHoveredByte(index),
            onPointerLeave: () => setHoveredByte(undefined),
            'aria-selected': activeByte !== undefined && index === activeByte,
        }
    }
    const emptyMessage =
        detailState?.kind === 'loading'
            ? 'Loading packet bytes...'
            : detailState?.kind === 'evicted'
              ? 'Packet bytes were evicted from retention.'
              : detailState?.kind === 'invalid'
                ? 'Packet bytes are invalid.'
                : detailState?.kind === 'unavailable'
                  ? 'Packet bytes are unavailable.'
                  : 'Select a packet to inspect its bytes'
    return (
        <PanelShell title="Bytes" showHeader={false}>
            <div className="flex h-full min-h-0 flex-col">
                {detail && bytes.length ? (
                    <div className="text-muted-foreground flex h-7 shrink-0 items-center justify-end border-b px-3 font-mono text-[11px] tabular-nums">
                        {bytes.length.toLocaleString()} bytes ·{' '}
                        {source?.name ?? `source ${sourceId}`}
                    </div>
                ) : null}
                {!detail ? (
                    <div
                        className="text-muted-foreground grid min-h-0 flex-1 place-items-center text-xs"
                        role={
                            detailState &&
                            ['evicted', 'invalid', 'unavailable'].includes(detailState.kind)
                                ? 'alert'
                                : 'status'
                        }
                    >
                        {emptyMessage}
                    </div>
                ) : (
                    <div
                        ref={scrollRef}
                        className="focus-visible:ring-ring min-h-0 flex-1 overflow-auto font-mono text-xs leading-6 tabular-nums focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                        role="grid"
                        tabIndex={0}
                        aria-label="Packet bytes"
                        aria-activedescendant={
                            activeByte !== undefined &&
                            virtualizer
                                .getVirtualItems()
                                .some(
                                    (item) =>
                                        activeByte >= item.index * BYTE_ROW_WIDTH &&
                                        activeByte < (item.index + 1) * BYTE_ROW_WIDTH,
                                )
                                ? `packet-byte-${activeByte}`
                                : undefined
                        }
                        onKeyDown={handleKey}
                        onPointerLeave={() => setHoveredByte(undefined)}
                    >
                        <div
                            className="relative min-w-[680px]"
                            style={{ height: virtualizer.getTotalSize() }}
                        >
                            {virtualizer.getVirtualItems().map((item) => {
                                const offset = item.index * BYTE_ROW_WIDTH
                                const row = bytes.subarray(offset, offset + BYTE_ROW_WIDTH)
                                return (
                                    <div
                                        key={item.key}
                                        className="absolute top-0 left-0 flex w-full px-3"
                                        style={{
                                            height: item.size,
                                            transform: `translateY(${item.start}px)`,
                                        }}
                                    >
                                        <span className="text-muted-foreground w-16 shrink-0">
                                            {offset.toString(16).padStart(8, '0')}
                                        </span>
                                        <span className="flex w-[25rem] shrink-0">
                                            {Array.from({ length: BYTE_ROW_WIDTH }, (_, column) => {
                                                const index = offset + column
                                                const highlighted =
                                                    range?.sourceId === sourceId &&
                                                    index >= range.start &&
                                                    index < range.end
                                                const hovered = hoveredByte === index
                                                return index < bytes.length ? (
                                                    <span
                                                        key={column}
                                                        id={`packet-byte-${index}`}
                                                        role="gridcell"
                                                        {...byteProps(index)}
                                                        aria-label={`Byte ${index}`}
                                                        className={`inline-block w-6 cursor-pointer text-center ${highlighted ? 'bg-primary text-primary-foreground' : hovered ? 'ring-primary ring-1 ring-inset' : ''}`}
                                                    >
                                                        {bytes[index]!.toString(16).padStart(
                                                            2,
                                                            '0',
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span
                                                        key={column}
                                                        className="inline-block w-6"
                                                    />
                                                )
                                            })}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className="border-l pl-3 tracking-[0.18em]"
                                        >
                                            {Array.from(row, (byte, column) => {
                                                const index = offset + column
                                                const highlighted =
                                                    range?.sourceId === sourceId &&
                                                    index >= range.start &&
                                                    index < range.end
                                                const hovered = hoveredByte === index
                                                return (
                                                    <span
                                                        key={column}
                                                        role="gridcell"
                                                        {...byteProps(index)}
                                                        aria-label={`ASCII equivalent of byte ${index}`}
                                                        className={`cursor-pointer ${highlighted ? 'bg-primary text-primary-foreground' : hovered ? 'ring-primary ring-1 ring-inset' : ''}`}
                                                    >
                                                        {byte >= 32 && byte <= 126
                                                            ? String.fromCharCode(byte)
                                                            : '·'}
                                                    </span>
                                                )
                                            })}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </PanelShell>
    )
}

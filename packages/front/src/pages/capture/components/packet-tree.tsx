import type { RegistrySnapshot } from '@repo/shared/capture'
import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { fieldLabel, NO_PARENT, visibleTreeRows } from '../model/packet-view'
import type { PacketDetailView } from '../model/packet-detail'
import { PanelShell } from './panel-shell'
import type { PacketDetailState } from '../hooks/use-packet-detail'

export function PacketTree({
    detail,
    registry,
    selected,
    onSelect,
    detailState,
}: {
    detail?: PacketDetailView
    registry?: RegistrySnapshot
    selected?: number
    onSelect: (index: number) => void
    detailState?: PacketDetailState
}) {
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set([0]))
    const treeRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (selected === undefined) return
        treeRef.current
            ?.querySelector<HTMLElement>(`[data-node-index="${selected}"]`)
            ?.scrollIntoView({ block: 'nearest' })
    }, [selected])
    if (!detail || !registry)
        return (
            <PanelShell title="Structure">
                <EmptyDetail state={detailState} />
            </PanelShell>
        )
    const packetDetail = detail
    const visibleExpanded = new Set(expanded)
    if (selected !== undefined) {
        let parent = packetDetail.nodes[selected]!.parentIndex
        while (parent !== NO_PARENT) {
            visibleExpanded.add(parent)
            parent = packetDetail.nodes[parent]!.parentIndex
        }
    }
    const rows = visibleTreeRows(packetDetail, visibleExpanded)
    const selectedPosition = rows.findIndex((row) => row.index === selected)
    function toggle(index: number) {
        setExpanded((current) => {
            const next = new Set(current)
            if (next.has(index)) next.delete(index)
            else next.add(index)
            return next
        })
    }
    function handleKey(key: string) {
        const row = rows[selectedPosition < 0 ? 0 : selectedPosition]
        if (!row) return
        if (key === 'ArrowDown')
            onSelect(rows[Math.min(rows.length - 1, selectedPosition + 1)]!.index)
        if (key === 'ArrowUp') onSelect(rows[Math.max(0, selectedPosition - 1)]!.index)
        if (key === 'ArrowRight') {
            if (row.hasChildren && !visibleExpanded.has(row.index)) toggle(row.index)
            else if (rows[selectedPosition + 1]) onSelect(rows[selectedPosition + 1]!.index)
        }
        if (key === 'ArrowLeft') {
            if (visibleExpanded.has(row.index)) toggle(row.index)
            else if (packetDetail.nodes[row.index]!.parentIndex !== NO_PARENT)
                onSelect(packetDetail.nodes[row.index]!.parentIndex)
        }
        if (key === 'Enter' || key === ' ') toggle(row.index)
    }
    return (
        <PanelShell title="Structure" meta={`${packetDetail.nodes.length} fields`}>
            <div
                ref={treeRef}
                role="tree"
                tabIndex={0}
                aria-label="Parsed packet structure"
                aria-activedescendant={
                    selected !== undefined && rows.some((row) => row.index === selected)
                        ? `packet-tree-node-${selected}`
                        : undefined
                }
                className="focus-visible:ring-ring h-full overflow-auto py-1 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                onKeyDown={(event) => {
                    if (
                        ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', ' '].includes(
                            event.key,
                        )
                    ) {
                        event.preventDefault()
                        handleKey(event.key)
                    }
                }}
            >
                {rows.map((row) => {
                    const node = packetDetail.nodes[row.index]!
                    const value = node.value
                    return (
                        <div
                            key={row.index}
                            id={`packet-tree-node-${row.index}`}
                            data-node-index={row.index}
                            role="treeitem"
                            aria-level={row.depth + 1}
                            aria-expanded={
                                row.hasChildren ? visibleExpanded.has(row.index) : undefined
                            }
                            aria-selected={selected === row.index}
                            onClick={() => onSelect(row.index)}
                            onDoubleClick={() => row.hasChildren && toggle(row.index)}
                            className={`flex h-8 cursor-default items-center gap-1 pr-2 text-sm ${selected === row.index ? 'bg-accent shadow-[inset_3px_0_0_var(--primary)]' : 'hover:bg-muted/40'}`}
                            style={{ paddingLeft: row.depth * 14 + 6 }}
                        >
                            <button
                                tabIndex={-1}
                                aria-hidden="true"
                                className={`grid size-4 shrink-0 place-items-center ${row.hasChildren ? '' : 'invisible'}`}
                                onClick={(event) => {
                                    event.stopPropagation()
                                    toggle(row.index)
                                }}
                            >
                                <ChevronRight
                                    className={`size-3 transition-transform ${visibleExpanded.has(row.index) ? 'rotate-90' : ''}`}
                                />
                            </button>
                            <span className="min-w-0 truncate font-medium">
                                {fieldLabel(registry, node.fieldId)}
                            </span>
                            {value && (
                                <span className="text-muted-foreground ml-auto max-w-[48%] truncate font-mono text-xs">
                                    {value}
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>
        </PanelShell>
    )
}

function EmptyDetail({ state }: { state?: PacketDetailState }) {
    const message =
        state?.kind === 'loading'
            ? 'Loading packet structure...'
            : state?.kind === 'evicted'
              ? 'Packet detail was evicted from retention.'
              : state?.kind === 'invalid'
                ? 'Packet detail is invalid.'
                : state?.kind === 'unavailable'
                  ? 'Packet detail is unavailable.'
                  : 'Select a packet to inspect its structure'
    return (
        <div
            className="text-muted-foreground grid h-full place-items-center text-xs"
            role={
                state && ['evicted', 'invalid', 'unavailable'].includes(state.kind)
                    ? 'alert'
                    : 'status'
            }
        >
            {message}
        </div>
    )
}

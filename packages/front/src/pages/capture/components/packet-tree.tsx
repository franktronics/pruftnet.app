import type { RegistrySnapshot } from '@repo/shared/capture'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { fieldLabel, NO_PARENT, visibleTreeRows } from '../model/packet-view'
import type { PacketDetailView } from '../model/packet-detail'
import { PanelShell } from './panel-shell'
import type { PacketDetailState } from '../hooks/use-packet-detail'
import { copyText } from '../model/copy-text'

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
    const [copyFeedback, setCopyFeedback] = useState<{ index: number; copied: boolean }>()
    const treeRef = useRef<HTMLDivElement>(null)
    const feedbackTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(feedbackTimer.current), [])
    useEffect(() => {
        if (selected === undefined) return
        treeRef.current
            ?.querySelector<HTMLElement>(`[data-node-index="${selected}"]`)
            ?.scrollIntoView({ block: 'nearest' })
    }, [selected])
    if (!detail || !registry)
        return (
            <PanelShell title="Structure" showHeader={false}>
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
    async function handleCopy(index: number, value: string) {
        const copied = await copyText(value)
        setCopyFeedback({ index, copied })
        clearTimeout(feedbackTimer.current)
        feedbackTimer.current = setTimeout(() => setCopyFeedback(undefined), 1_500)
    }
    return (
        <PanelShell title="Structure" showHeader={false}>
            <div className="flex h-full min-h-0 flex-col">
                <div className="text-muted-foreground flex h-7 shrink-0 items-center justify-end border-b px-3 font-mono text-[11px] tabular-nums">
                    {packetDetail.nodes.length.toLocaleString()} fields
                </div>
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
                    className="focus-visible:ring-ring min-h-0 flex-1 overflow-auto py-1 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
                    onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
                            const selectedIndex = selected
                            const value =
                                selectedIndex === undefined
                                    ? undefined
                                    : packetDetail.nodes[selectedIndex]?.value
                            if (value && selectedIndex !== undefined) {
                                event.preventDefault()
                                void handleCopy(selectedIndex, value)
                            }
                            return
                        }
                        if (
                            [
                                'ArrowDown',
                                'ArrowUp',
                                'ArrowRight',
                                'ArrowLeft',
                                'Enter',
                                ' ',
                            ].includes(event.key)
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
                                className={`group/tree-row flex h-8 cursor-default items-center gap-1 pr-2 text-[13px] ${selected === row.index ? 'bg-accent shadow-[inset_2px_0_0_var(--primary)]' : 'hover:bg-muted/50'}`}
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
                                    <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring ml-auto flex max-w-[52%] min-w-0 items-center gap-1 rounded-sm px-1 font-mono text-xs outline-none focus-visible:ring-1 focus-visible:[&_svg]:opacity-60"
                                        aria-label={`Copy ${fieldLabel(registry, node.fieldId)} value`}
                                        title="Copy value"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            void handleCopy(row.index, value)
                                        }}
                                        onDoubleClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
                                        <span className="truncate">{value}</span>
                                        {copyFeedback?.index === row.index &&
                                        copyFeedback.copied ? (
                                            <Check className="text-primary size-3 shrink-0" />
                                        ) : (
                                            <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/tree-row:opacity-60 group-focus-visible/tree-row:opacity-60" />
                                        )}
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
            <span className="sr-only" aria-live="polite">
                {copyFeedback ? (copyFeedback.copied ? 'Value copied' : 'Copy failed') : ''}
            </span>
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

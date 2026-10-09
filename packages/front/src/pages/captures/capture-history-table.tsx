import type { CaptureRecord } from '@repo/shared/capture'
import {
    MiddleTruncate,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@repo/ui'
import { cn } from '@repo/utils'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useRef } from 'react'

import { CopyButton } from '#front/components/copy-button'

import { type CaptureActionHandlers, CaptureContextMenu } from './capture-actions'
import {
    type CaptureHealth,
    type CaptureSort,
    type CaptureSortKey,
    captureDurationSeconds,
    captureHealth,
    captureHealthLabel,
    captureNotice,
    captureSourceLabel,
    formatDateTime,
    formatDuration,
    formatShortDateTime,
} from './capture-history'
import { formatBytes } from './format-bytes'

/** Needs an `@container` ancestor: the history page's table scroller. */
const captureIdColumn = 'hidden @3xl:table-cell'

const healthTextClass: Record<CaptureHealth, string> = {
    live: 'text-emerald-600 dark:text-emerald-400',
    healthy: 'text-muted-foreground',
    degraded: 'text-amber-600 dark:text-amber-400',
    failed: 'text-destructive',
}

export function healthText(health: CaptureHealth) {
    return healthTextClass[health]
}

export function CaptureStatus({
    health,
    className,
}: {
    health: CaptureHealth
    className?: string
}) {
    return (
        <span className={cn(healthTextClass[health], className)}>{captureHealthLabel[health]}</span>
    )
}

export function CaptureHistoryTable({
    captures,
    selectedId,
    sort,
    onSortChange,
    onSelect,
    onActivate,
    activateOnClick = false,
    handlers,
}: {
    /** The rows of the current page, already filtered and sorted. */
    captures: CaptureRecord[]
    selectedId: string | undefined
    sort: CaptureSort
    onSortChange: (key: CaptureSortKey) => void
    /** Keyboard navigation, right click, and (by default) a single click. */
    onSelect: (capture: CaptureRecord) => void
    /** Double click or Enter: the row's primary action. */
    onActivate: (capture: CaptureRecord) => void
    /** Without an inspector there is nothing to select into, so a click opens the row. */
    activateOnClick?: boolean
    handlers: CaptureActionHandlers
}) {
    const bodyRef = useRef<HTMLTableSectionElement>(null)

    function handleKeyDown(event: KeyboardEvent, capture: CaptureRecord) {
        if (event.key === 'Enter') {
            event.preventDefault()
            onActivate(capture)
            return
        }
        const index = captures.indexOf(capture)
        const target = {
            ArrowDown: captures[index + 1],
            ArrowUp: captures[index - 1],
            Home: captures[0],
            End: captures.at(-1),
        }[event.key]
        if (!target) return
        event.preventDefault()
        onSelect(target)
        bodyRef.current
            ?.querySelector<HTMLElement>(`[data-capture-id="${target.captureId}"]`)
            ?.focus()
    }

    // Keep exactly one row in the tab order, even when the selection is on another page.
    const focusableId = captures.some((capture) => capture.captureId === selectedId)
        ? selectedId
        : captures[0]?.captureId

    const sortableHead = (key: CaptureSortKey, label: string, className?: string) => (
        <SortableHead
            label={label}
            active={sort.key === key}
            direction={sort.direction}
            onSort={() => onSortChange(key)}
            className={className}
        />
    )

    return (
        <Table
            containerClassName="overflow-visible"
            className="min-w-[36rem] table-fixed text-[13px]"
        >
            {/* The page scroller owns both axes so the sticky header anchors to it. */}
            <TableHeader className="sticky top-0 z-10">
                <TableRow>
                    {sortableHead('started', 'Started', 'w-32')}
                    {sortableHead('state', 'State', 'w-24')}
                    <TableHead>Interfaces</TableHead>
                    {/* Hidden while the inspector leaves the table too narrow; the ID stays in the panel. */}
                    <TableHead className={cn('w-40', captureIdColumn)}>Capture ID</TableHead>
                    {sortableHead('duration', 'Duration', 'w-24 text-right')}
                    {sortableHead('packets', 'Packets', 'w-24 text-right')}
                    {sortableHead('size', 'Size', 'w-24 text-right')}
                </TableRow>
            </TableHeader>
            <TableBody ref={bodyRef}>
                {captures.map((capture) => {
                    const health = captureHealth(capture)
                    const notice = captureNotice(capture)
                    const selected = capture.captureId === selectedId
                    return (
                        <CaptureContextMenu
                            key={capture.captureId}
                            capture={capture}
                            handlers={handlers}
                            render={
                                <TableRow
                                    data-capture-id={capture.captureId}
                                    data-state={selected ? 'selected' : undefined}
                                    aria-current={selected || undefined}
                                    tabIndex={capture.captureId === focusableId ? 0 : -1}
                                    onClick={() =>
                                        (activateOnClick ? onActivate : onSelect)(capture)
                                    }
                                    onDoubleClick={() => onActivate(capture)}
                                    onKeyDown={(event) => handleKeyDown(event, capture)}
                                    onContextMenu={() => onSelect(capture)}
                                    className={cn(
                                        'group/row cursor-default outline-none select-none',
                                        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset',
                                    )}
                                >
                                    <TableCell
                                        className="tabular-nums"
                                        title={formatDateTime(capture.startedAtNs)}
                                    >
                                        {formatShortDateTime(capture.startedAtNs)}
                                    </TableCell>
                                    <TableCell>
                                        <CaptureStatus health={health} />
                                    </TableCell>
                                    <TableCell>
                                        <span className="flex min-w-0 items-baseline gap-1.5">
                                            <span className="truncate">
                                                {captureSourceLabel(capture)}
                                            </span>
                                            {notice ? (
                                                <span
                                                    className={cn(
                                                        'truncate text-xs',
                                                        healthTextClass[health],
                                                    )}
                                                >
                                                    {notice}
                                                </span>
                                            ) : null}
                                            {capture.sourceFormat !== 'pcapng' ? (
                                                <span className="text-muted-foreground text-xs uppercase">
                                                    {capture.sourceFormat}
                                                </span>
                                            ) : null}
                                        </span>
                                    </TableCell>
                                    <TableCell className={captureIdColumn}>
                                        <CaptureIdCell captureId={capture.captureId} />
                                    </TableCell>
                                    <NumberCell muted>
                                        {formatDuration(captureDurationSeconds(capture))}
                                    </NumberCell>
                                    <NumberCell>
                                        {BigInt(capture.packetCount).toLocaleString()}
                                    </NumberCell>
                                    <NumberCell muted>
                                        {formatBytes(capture.retainedBytes)}
                                    </NumberCell>
                                </TableRow>
                            }
                        />
                    )
                })}
            </TableBody>
        </Table>
    )
}

function CaptureIdCell({ captureId }: { captureId: string }) {
    return (
        <span className="flex min-w-0 items-center gap-1">
            <MiddleTruncate
                value={captureId}
                tailLength={6}
                className="text-muted-foreground font-mono text-xs [[data-state=selected]_&]:text-inherit"
            />
            {/* Copying is not a row action: keep clicks and Enter from selecting or opening. */}
            <span
                className="contents"
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
            >
                <CopyButton
                    value={captureId}
                    label="capture ID"
                    className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100"
                />
            </span>
        </span>
    )
}

function NumberCell({ muted = false, children }: { muted?: boolean; children: ReactNode }) {
    return (
        <TableCell
            className={cn(
                'text-right tabular-nums',
                muted && 'text-muted-foreground [[data-state=selected]_&]:text-inherit',
            )}
        >
            {children}
        </TableCell>
    )
}

const ariaSort = { asc: 'ascending', desc: 'descending' } as const

function SortableHead({
    label,
    active,
    direction,
    onSort,
    className,
}: {
    label: string
    active: boolean
    direction: 'asc' | 'desc'
    onSort: () => void
    className?: string
}) {
    const Arrow = direction === 'asc' ? ArrowUp : ArrowDown
    const alignEnd = className?.includes('text-right')
    return (
        <TableHead
            aria-sort={active ? ariaSort[direction] : undefined}
            className={cn('p-0', className)}
        >
            <button
                type="button"
                onClick={onSort}
                className={cn(
                    'hover:text-foreground focus-visible:ring-ring flex h-8 w-full items-center gap-1 px-2',
                    'transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset',
                    alignEnd && 'flex-row-reverse',
                    active && 'text-foreground',
                )}
            >
                {label}
                <Arrow
                    aria-hidden
                    className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-0')}
                />
            </button>
        </TableHead>
    )
}

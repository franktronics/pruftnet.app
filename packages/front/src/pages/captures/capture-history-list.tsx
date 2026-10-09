import type { CaptureRecord } from '@repo/shared/capture'
import { cn } from '@repo/utils'
import { type KeyboardEvent, useRef } from 'react'

import { type CaptureActionHandlers, CaptureContextMenu } from './capture-actions'
import {
    type CaptureDayGroup,
    type CaptureHealth,
    captureDurationSeconds,
    captureHealth,
    captureNotice,
    captureSourceLabel,
    formatDayLabel,
    formatDuration,
    formatTimeRange,
} from './capture-history'
import { formatBytes } from './format-bytes'

const healthDotClass: Record<CaptureHealth, string> = {
    live: 'bg-emerald-500',
    healthy: 'bg-muted-foreground/45',
    degraded: 'bg-amber-500',
    failed: 'bg-destructive',
}

const healthTextClass: Record<CaptureHealth, string> = {
    live: 'text-emerald-600 dark:text-emerald-400',
    healthy: 'text-muted-foreground',
    degraded: 'text-amber-600 dark:text-amber-400',
    failed: 'text-destructive',
}

export function HealthDot({ health, className }: { health: CaptureHealth; className?: string }) {
    return (
        <span
            aria-hidden
            className={cn('size-2 shrink-0 rounded-full', healthDotClass[health], className)}
        />
    )
}

export function healthText(health: CaptureHealth) {
    return healthTextClass[health]
}

/**
 * Volume on a log scale: captures range from a handful of packets to millions, and a linear bar
 * would leave every small session at zero width.
 */
function volumeRatio(packets: bigint, maxPackets: bigint) {
    if (maxPackets === 0n) return 0
    return Math.log10(Number(packets) + 1) / Math.log10(Number(maxPackets) + 1)
}

export function CaptureHistoryList({
    groups,
    selectedId,
    maxPackets,
    onSelect,
    onActivate,
    handlers,
}: {
    groups: CaptureDayGroup[]
    selectedId: string | undefined
    maxPackets: bigint
    onSelect: (capture: CaptureRecord) => void
    /** Double click or Enter: the row's primary action. */
    onActivate: (capture: CaptureRecord) => void
    handlers: CaptureActionHandlers
}) {
    const listRef = useRef<HTMLDivElement>(null)
    const ordered = groups.flatMap((group) => group.captures)

    function moveSelection(event: KeyboardEvent, capture: CaptureRecord) {
        const index = ordered.indexOf(capture)
        const target = {
            ArrowDown: ordered[index + 1],
            ArrowUp: ordered[index - 1],
            Home: ordered[0],
            End: ordered.at(-1),
        }[event.key]
        if (event.key === 'Enter') {
            event.preventDefault()
            onActivate(capture)
            return
        }
        if (!target) return
        event.preventDefault()
        onSelect(target)
        listRef.current
            ?.querySelector<HTMLElement>(`[data-capture-id="${target.captureId}"]`)
            ?.focus()
    }

    // Keep exactly one row in the tab order, even when the selection is filtered out.
    const focusableId = ordered.some((capture) => capture.captureId === selectedId)
        ? selectedId
        : ordered[0]?.captureId

    return (
        <div ref={listRef} role="listbox" aria-label="Captures" className="@container">
            {groups.map((group) => (
                <div key={group.key} role="group" aria-label={formatDayLabel(group.startedAtMs)}>
                    <div
                        className={cn(
                            'bg-background sticky top-0 z-10 flex h-8 items-end justify-between',
                            'border-b px-3 pb-1.5 text-xs',
                        )}
                    >
                        <span className="text-foreground font-medium">
                            {formatDayLabel(group.startedAtMs)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                            {group.captures.length === 1
                                ? '1 capture'
                                : `${group.captures.length} captures`}
                            {' · '}
                            {formatBytes(group.retainedBytes)}
                        </span>
                    </div>
                    {group.captures.map((capture) => (
                        <CaptureContextMenu
                            key={capture.captureId}
                            capture={capture}
                            handlers={handlers}
                        >
                            <CaptureRow
                                capture={capture}
                                selected={capture.captureId === selectedId}
                                focusable={capture.captureId === focusableId}
                                maxPackets={maxPackets}
                                onSelect={onSelect}
                                onActivate={onActivate}
                                onKeyDown={moveSelection}
                            />
                        </CaptureContextMenu>
                    ))}
                </div>
            ))}
        </div>
    )
}

function CaptureRow({
    capture,
    selected,
    focusable,
    maxPackets,
    onSelect,
    onActivate,
    onKeyDown,
}: {
    capture: CaptureRecord
    selected: boolean
    focusable: boolean
    maxPackets: bigint
    onSelect: (capture: CaptureRecord) => void
    onActivate: (capture: CaptureRecord) => void
    onKeyDown: (event: KeyboardEvent, capture: CaptureRecord) => void
}) {
    const health = captureHealth(capture)
    const notice = captureNotice(capture)
    const packets = BigInt(capture.packetCount)
    const source = captureSourceLabel(capture)

    return (
        <div
            role="option"
            aria-selected={selected}
            aria-label={source}
            data-capture-id={capture.captureId}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onSelect(capture)}
            onDoubleClick={() => onActivate(capture)}
            onKeyDown={(event) => onKeyDown(event, capture)}
            onContextMenu={() => onSelect(capture)}
            className={cn(
                'grid h-8 cursor-default items-center gap-3 border-b px-3 text-[13px]',
                // Optional columns are display:none below their breakpoint and take no track.
                'grid-cols-[0.5rem_minmax(0,1fr)_auto]',
                '@lg:grid-cols-[0.5rem_minmax(0,1fr)_7.5rem_4.5rem_5.5rem]',
                '@2xl:grid-cols-[0.5rem_minmax(0,1fr)_7.5rem_4.5rem_5.5rem_3rem_4.5rem]',
                'transition-colors outline-none',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset',
                selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60',
            )}
        >
            <HealthDot health={health} />
            <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate font-medium">{source}</span>
                {notice ? (
                    <span className={cn('truncate text-xs', healthTextClass[health])}>
                        {notice}
                    </span>
                ) : null}
                {capture.sourceFormat !== 'pcapng' ? (
                    <span className="text-muted-foreground text-xs uppercase">
                        {capture.sourceFormat}
                    </span>
                ) : null}
            </span>
            <span className="text-muted-foreground hidden truncate tabular-nums @lg:block">
                {formatTimeRange(capture)}
            </span>
            <span className="text-muted-foreground hidden text-right tabular-nums @lg:block">
                {formatDuration(captureDurationSeconds(capture))}
            </span>
            <span className="text-right tabular-nums" title="Packets">
                {packets.toLocaleString()}
            </span>
            <span
                aria-hidden
                className="bg-muted hidden h-1 overflow-hidden rounded-full @2xl:block"
            >
                <span
                    className={cn(
                        'block h-full rounded-full',
                        selected ? 'bg-accent-foreground/60' : 'bg-muted-foreground/60',
                    )}
                    style={{ width: `${volumeRatio(packets, maxPackets) * 100}%` }}
                />
            </span>
            <span className="text-muted-foreground hidden text-right tabular-nums @2xl:block">
                {formatBytes(capture.retainedBytes)}
            </span>
        </div>
    )
}

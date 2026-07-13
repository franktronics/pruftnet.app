import { Badge, Button, Input } from '@repo/ui'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'

import {
    AdvancedDisplayFilters,
    type DisplayFilterInterface,
    type DisplayFilterProtocol,
} from './advanced-display-filters'
import { countAdvancedPacketFilters, type PacketDisplayFilters } from '../model/packet-filters'

export function DisplayFilter({
    value,
    onChange,
    filters,
    onFiltersChange,
    protocols = [],
    interfaces = [],
    maxTimeSeconds = 0,
    visibleCount = 0,
    totalCount = 0,
}: {
    value: string
    onChange: (value: string) => void
    filters: PacketDisplayFilters
    onFiltersChange: (filters: PacketDisplayFilters) => void
    protocols?: readonly DisplayFilterProtocol[]
    interfaces?: readonly DisplayFilterInterface[]
    maxTimeSeconds?: number
    visibleCount?: number
    totalCount?: number
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const activeCount = countAdvancedPacketFilters(filters)
    return (
        <div className="bg-background flex h-10 shrink-0 items-center gap-2.5 border-b px-3">
            <Search className="text-muted-foreground size-4" />
            <Input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label="Display filter"
                placeholder="Filter displayed packets..."
                spellCheck={false}
                className="border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {totalCount > 0 ? (
                <span className="text-muted-foreground hidden shrink-0 text-[11px] tabular-nums sm:inline">
                    {visibleCount.toLocaleString()} / {totalCount.toLocaleString()}
                </span>
            ) : null}
            {value ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear display filter"
                    onClick={() => onChange('')}
                >
                    <X />
                </Button>
            ) : null}
            <Button
                type="button"
                variant={activeCount > 0 ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAdvancedOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={advancedOpen}
            >
                <SlidersHorizontal />
                <span className="hidden sm:inline">Advanced filters</span>
                {activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}
            </Button>
            {advancedOpen ? (
                <AdvancedDisplayFilters
                    open
                    onOpenChange={setAdvancedOpen}
                    filters={filters}
                    onApply={onFiltersChange}
                    protocols={protocols}
                    interfaces={interfaces}
                    maxTimeSeconds={maxTimeSeconds}
                />
            ) : null}
        </div>
    )
}

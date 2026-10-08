import { Badge, Button } from '@repo/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'

import {
    AdvancedDisplayFilters,
    type DisplayFilterInterface,
    type DisplayFilterProtocol,
} from './advanced-display-filters'
import {
    countAdvancedPacketFilters,
    type PacketDisplayFilters,
} from '#front/pages/capture/model/packet-filters'
import { ToolbarSearch } from '#front/components/toolbar-search'

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
    counting = false,
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
    counting?: boolean
}) {
    const [advancedOpen, setAdvancedOpen] = useState(false)
    const activeCount = countAdvancedPacketFilters(filters)
    const filtering = value.trim() !== '' || activeCount > 0
    return (
        <ToolbarSearch
            value={value}
            onChange={onChange}
            label="Display filter"
            placeholder="Filter displayed packets..."
            count={
                totalCount > 0
                    ? filtering
                        ? `${visibleCount.toLocaleString()}${counting ? '+' : ''} / ${totalCount.toLocaleString()}`
                        : totalCount.toLocaleString()
                    : undefined
            }
            countTitle={
                counting ? 'Showing the first matches. Counting remaining packets...' : undefined
            }
        >
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
        </ToolbarSearch>
    )
}

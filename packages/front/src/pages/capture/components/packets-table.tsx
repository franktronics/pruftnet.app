import { Table, TableBody, TableHead, TableHeader, TableRow, Badge } from '@repo/ui/atoms'
import { useRef, type ComponentPropsWithoutRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@repo/utils'
import type { PacketDataForClient } from '@repo/core-node/types'
import { PacketFormater } from '../utils/packets-formatter'

export type RowDataType = {
    index: number
    time: string
    src: string
    dest: string
    protocol: string
    length: number
    info: string
}

export type PacketsTableProps = {
    packets: PacketDataForClient[]
    onHandleRowSelect: (n: number | null) => void
    selectedRow: number | null
} & ComponentPropsWithoutRef<'div'>
export const PacketsTable = (props: PacketsTableProps) => {
    const { packets, className, onHandleRowSelect, selectedRow, ...rest } = props

    const parentRef = useRef<HTMLDivElement>(null)

    const virtualizer = useVirtualizer({
        count: packets.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53,
        overscan: 10,
    })

    return (
        <div {...rest} className={cn('flex flex-col overflow-hidden rounded-lg border', className)}>
            <div className="bg-muted shrink-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-16 text-center">No</TableHead>
                            <TableHead className="w-32">Time</TableHead>
                            <TableHead className="w-40">Source</TableHead>
                            <TableHead className="w-40">Destination</TableHead>
                            <TableHead className="w-24">Protocol</TableHead>
                            <TableHead className="w-24">Length</TableHead>
                            <TableHead className="min-w-0">Info</TableHead>
                        </TableRow>
                    </TableHeader>
                </Table>
            </div>

            <div ref={parentRef} className={cn('flex-1 overflow-auto', 'scrollbar-thin')}>
                <Table>
                    <TableBody>
                        <tr style={{ height: `${virtualizer.getTotalSize()}px` }}>
                            <td colSpan={7} className="relative p-0">
                                {virtualizer.getVirtualItems().map((virtualItem) => (
                                    <div
                                        key={virtualItem.key}
                                        style={{
                                            height: `${virtualItem.size}px`,
                                            transform: `translateY(${virtualItem.start}px)`,
                                        }}
                                        className={cn(
                                            'hover:bg-muted/50 flex w-full items-center border-b transition-colors',
                                            'absolute top-0 left-0',
                                            'cursor-pointer *:px-2',
                                            { 'bg-muted!': selectedRow === virtualItem.index },
                                        )}
                                        onClick={() => {
                                            if (selectedRow === virtualItem.index) {
                                                onHandleRowSelect(null)
                                                return
                                            }
                                            onHandleRowSelect(virtualItem.index)
                                        }}
                                    >
                                        <div className="w-16 text-center font-medium">
                                            {packets[virtualItem.index].id}
                                        </div>
                                        <div className="w-32">
                                            {PacketFormater.getTime(packets[virtualItem.index])}
                                        </div>
                                        <div className="w-40">
                                            {PacketFormater.getSource(packets[virtualItem.index])}
                                        </div>
                                        <div className="w-40">
                                            {PacketFormater.getDestination(
                                                packets[virtualItem.index],
                                            )}
                                        </div>
                                        <div className="w-24">
                                            <Badge
                                                variant="outline"
                                                className="text-muted-foreground px-1.5"
                                            >
                                                {'TCP'}
                                            </Badge>
                                        </div>
                                        <div className="w-24">
                                            {PacketFormater.getLength(packets[virtualItem.index])}
                                        </div>
                                        <div className="flex-1">{'Lorem ipsum'}</div>
                                    </div>
                                ))}
                            </td>
                        </tr>
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

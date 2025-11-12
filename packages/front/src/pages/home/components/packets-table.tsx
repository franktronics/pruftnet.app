import { Table, TableBody, TableHead, TableHeader, TableRow, Badge } from '@repo/ui/atoms'
import { useRef, type ComponentPropsWithoutRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePacketTable } from '../hooks/use-packet-table'
import { cn } from '@repo/utils'

export type PacketsTableProps = ComponentPropsWithoutRef<'div'>
export const PacketsTable = (props: PacketsTableProps) => {
    const parentRef = useRef<HTMLDivElement>(null)

    const { data } = usePacketTable()

    const virtualizer = useVirtualizer({
        count: data.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 53,
        overscan: 10,
    })

    return (
        <div {...props} className="h-160 overflow-hidden border">
            <div className="bg-muted">
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

            <div ref={parentRef} className="h-[calc(40rem-3.5rem)] overflow-auto">
                <Table>
                    <TableBody>
                        <tr
                            style={{ height: `${virtualizer.getTotalSize()}px` }}
                            className="cursor-pointer"
                        >
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
                                            '*:px-2',
                                        )}
                                    >
                                        <div className="w-16 text-center font-medium">
                                            {data[virtualItem.index].index}
                                        </div>
                                        <div className="w-32">{data[virtualItem.index].time}</div>
                                        <div className="w-40">{data[virtualItem.index].src}</div>
                                        <div className="w-40">{data[virtualItem.index].dest}</div>
                                        <div className="w-24">
                                            <Badge
                                                variant="outline"
                                                className="text-muted-foreground px-1.5"
                                            >
                                                {data[virtualItem.index].protocol}
                                            </Badge>
                                        </div>
                                        <div className="w-24">{data[virtualItem.index].length}</div>
                                        <div className="flex-1">{data[virtualItem.index].info}</div>
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

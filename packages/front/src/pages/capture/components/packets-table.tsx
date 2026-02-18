import { Table, TableBody, TableHead, TableHeader, Badge, TableRow } from '@repo/ui/atoms'
import { useMemo, useRef, type ComponentProps, type ComponentPropsWithoutRef } from 'react'
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual'
import { cn, useQuery } from '@repo/utils'
import type { PacketDataWithoutRaw } from '@repo/core-node/types'
import { PacketFormaterFactory } from '../utils/packets-formatter'
import { fetcher } from '../../../config/client-trpc'

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
    packets: PacketDataWithoutRaw[]
    onHandleRowSelect: (n: number) => void
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
                            <TableHead className="w-32">Time (ms)</TableHead>
                            <TableHead className="w-45">Source</TableHead>
                            <TableHead className="w-45">Destination</TableHead>
                            <TableHead className="w-24">Protocol</TableHead>
                            <TableHead className="w-35">Length (bytes)</TableHead>
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
                                    <TableRowElt
                                        key={virtualItem.key}
                                        onClick={() => {
                                            onHandleRowSelect(virtualItem.index)
                                        }}
                                        selected={selectedRow === virtualItem.index}
                                        virtualItem={virtualItem}
                                        packet={packets[virtualItem.index]}
                                    />
                                ))}
                            </td>
                        </tr>
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}

type TableRowEltProps = {
    selected: boolean
    virtualItem: VirtualItem
    packet: PacketDataWithoutRaw
} & ComponentProps<'div'>
const TableRowElt = (props: TableRowEltProps) => {
    const { selected, virtualItem, packet, ...rest } = props

    const lastProtocolFile: string | undefined = packet.parsed[packet.parsed.length - 1]?.file
    const { data, isPending, error } = useQuery({
        queryKey: ['protocol_file', lastProtocolFile],
        staleTime: Infinity,
        enabled: !!lastProtocolFile,
        retry: 0,
        queryFn: fetcher.protocolFiles.getByPath.query({ path: lastProtocolFile ?? '' }),
    })

    const formater = useMemo(() => {
        return PacketFormaterFactory.create(packet, data)
    }, [packet, data])

    return (
        <div
            style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
            }}
            className={cn(
                'hover:bg-muted/50 flex w-full items-center border-b transition-colors',
                'absolute top-0 left-0',
                'cursor-pointer *:px-2',
                { 'bg-muted!': selected },
            )}
            {...rest}
        >
            <div className="w-16 text-center font-medium">{packet.id}</div>
            <div className="w-32">{formater.getTime()}</div>
            <div className="w-45 font-mono">{formater.getSource()}</div>
            <div className="w-45 font-mono">{formater.getDestination()}</div>
            <div className="w-24">
                <Badge variant="outline" className="text-muted-foreground px-1.5">
                    {isPending ? '...' : formater.getProtocol()}
                </Badge>
            </div>
            <div className="w-35">{formater.getLength()}</div>
            <div className="flex-1">
                {isPending ? 'loading...' : error !== null ? 'loading failed' : formater.getInfo()}
            </div>
        </div>
    )
}

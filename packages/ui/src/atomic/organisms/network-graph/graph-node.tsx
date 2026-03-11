import { cn, cond, type HostBaseData } from '@repo/utils'
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'
import { ArrowLeftRight, Computer, EthernetPort, Router, ShieldCheck, Wifi } from 'lucide-react'
import {
    Badge,
    Button,
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    ScrollArea,
    Separator,
} from '../../atoms'

export type DeviceNodeData = Node<HostBaseData>
export type GraphDeviceNodeProps = {
    className?: string
} & NodeProps<DeviceNodeData>

const DEVICE_TYPE_LABELS: Record<HostBaseData['type'], string> = {
    host: 'Host',
    router: 'Router',
    me: 'This device',
}

const DEVICE_TYPE_ICONS: Record<HostBaseData['type'], typeof Computer> = {
    host: Computer,
    router: Router,
    me: ShieldCheck,
}

const DEVICE_TYPE_BADGE_VARIANTS: Record<
    HostBaseData['type'],
    'default' | 'secondary' | 'outline'
> = {
    host: 'outline',
    router: 'secondary',
    me: 'default',
}

type DetailRowProps = {
    label: string
    value: string
    monospace?: boolean
}

const DetailRow = (props: DetailRowProps) => {
    const { label, value, monospace = false } = props

    return (
        <div className="bg-card/60 flex items-start justify-between gap-3 rounded-lg border px-4 py-3">
            <span className="text-muted-foreground text-xs tracking-[0.18em] uppercase">
                {label}
            </span>
            <span
                className={cn('text-right text-sm font-medium', monospace && 'font-mono text-xs')}
            >
                {value}
            </span>
        </div>
    )
}

type ConnectionRowProps = {
    targetMac: string
    sent: number
    received: number
}

const ConnectionRow = (props: ConnectionRowProps) => {
    const { targetMac, sent, received } = props

    return (
        <div className="bg-card/70 rounded-xl border p-4 shadow-xs">
            <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                    <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                        Connected host
                    </p>
                    <p className="font-mono text-sm">{targetMac}</p>
                </div>
                <Badge variant="outline" className="gap-1.5">
                    <ArrowLeftRight className="size-3" />
                    {sent + received} packets
                </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px] tracking-[0.16em] uppercase">
                        Sent
                    </p>
                    <p className="mt-1 text-lg font-semibold">{sent}</p>
                </div>
                <div className="bg-muted/50 rounded-lg px-3 py-2">
                    <p className="text-muted-foreground text-[11px] tracking-[0.16em] uppercase">
                        Received
                    </p>
                    <p className="mt-1 text-lg font-semibold">{received}</p>
                </div>
            </div>
        </div>
    )
}

export const GraphDeviceNode = (props: GraphDeviceNodeProps) => {
    const { className, data } = props
    const { mac, vendor, ipv4, ipv6, type, connectedTo } = data

    const totalSent = Object.values(connectedTo).reduce(
        (total, link) => total + link.numPacketsSend,
        0,
    )
    const totalReceived = Object.values(connectedTo).reduce(
        (total, link) => total + link.numPacketsReceived,
        0,
    )
    const totalPeers = Object.keys(connectedTo).length
    const totalPackets = totalSent + totalReceived
    const DeviceIcon = DEVICE_TYPE_ICONS[type]
    const primaryLabel = cond([!!ipv4, ipv4], [!!ipv6, ipv6], [!!mac, mac])
    const sortedConnections = Object.entries(connectedTo).sort(([, left], [, right]) => {
        const leftTotal = left.numPacketsSend + left.numPacketsReceived
        const rightTotal = right.numPacketsSend + right.numPacketsReceived
        return rightTotal - leftTotal
    })

    return (
        <Drawer direction="left">
            <DrawerTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className={cn('relative size-12.5 rounded-full', className)}
                    tabIndex={0}
                >
                    <Computer className="size-6" />
                    <Handle type="source" position={Position.Top} className="hidden" />
                    <p className="absolute top-[calc(100%+0.5rem)] flex flex-col">
                        <span>{primaryLabel}</span>
                        <span>{vendor ? vendor.slice(0, 10) : ''}</span>
                    </p>
                </Button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[min(92vw,30rem)] rounded-r-2xl border-r p-0 sm:max-w-none">
                <DrawerHeader className="border-b px-6 py-5 text-left">
                    <div className="flex items-start gap-4 pr-8">
                        <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl border">
                            <DeviceIcon className="size-6" />
                        </div>
                        <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <DrawerTitle className="text-lg">{primaryLabel}</DrawerTitle>
                                <Badge variant={DEVICE_TYPE_BADGE_VARIANTS[type]}>
                                    {DEVICE_TYPE_LABELS[type]}
                                </Badge>
                            </div>
                            <DrawerDescription className="leading-6">
                                {vendor || 'Unknown vendor'} - {totalPeers} linked device
                                {totalPeers > 1 ? 's' : ''}
                            </DrawerDescription>
                        </div>
                    </div>
                </DrawerHeader>

                <ScrollArea className="flex-1">
                    <div className="space-y-6 px-6 py-6">
                        <section className="grid grid-cols-3 gap-3">
                            <div className="bg-card rounded-xl border px-4 py-3">
                                <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                                    Peers
                                </p>
                                <p className="mt-2 text-2xl font-semibold">{totalPeers}</p>
                            </div>
                            <div className="bg-card rounded-xl border px-4 py-3">
                                <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                                    Sent
                                </p>
                                <p className="mt-2 text-2xl font-semibold">{totalSent}</p>
                            </div>
                            <div className="bg-card rounded-xl border px-4 py-3">
                                <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">
                                    Received
                                </p>
                                <p className="mt-2 text-2xl font-semibold">{totalReceived}</p>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <EthernetPort className="text-muted-foreground size-4" />
                                <h3 className="text-sm font-semibold">Host details</h3>
                            </div>
                            <div className="space-y-3">
                                <DetailRow label="MAC" value={mac} monospace={true} />
                                <DetailRow label="Vendor" value={vendor || 'Unknown vendor'} />
                                <DetailRow
                                    label="IPv4"
                                    value={ipv4 || 'Not detected yet'}
                                    monospace={!!ipv4}
                                />
                                <DetailRow
                                    label="IPv6"
                                    value={ipv6 || 'Not detected yet'}
                                    monospace={!!ipv6}
                                />
                                <DetailRow
                                    label="Traffic"
                                    value={`${totalPackets} packets observed`}
                                />
                            </div>
                        </section>

                        <Separator />

                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Wifi className="text-muted-foreground size-4" />
                                <h3 className="text-sm font-semibold">Observed connections</h3>
                            </div>
                            {sortedConnections.length > 0 ? (
                                <div className="space-y-3">
                                    {sortedConnections.map(([targetMac, linkData]) => (
                                        <ConnectionRow
                                            key={targetMac}
                                            targetMac={targetMac}
                                            sent={linkData.numPacketsSend}
                                            received={linkData.numPacketsReceived}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-muted/30 rounded-xl border border-dashed px-4 py-6 text-center">
                                    <p className="text-sm font-medium">
                                        No connection detected yet
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-sm">
                                        Keep the capture running to enrich this device profile.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>
                </ScrollArea>

                <DrawerFooter className="bg-background/95 border-t px-6 py-4 backdrop-blur-sm">
                    <DrawerClose asChild>
                        <Button variant="outline" className="w-full">
                            Close details
                        </Button>
                    </DrawerClose>
                </DrawerFooter>
            </DrawerContent>
        </Drawer>
    )
}

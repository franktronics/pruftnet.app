import { cn, cond, type HostBaseData } from '@repo/utils'
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'
import {
    ArrowLeftRight,
    ChartPie,
    Computer,
    EthernetPort,
    Monitor,
    Router,
    Wifi,
} from 'lucide-react'
import {
    Badge,
    Button,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    Pie,
    PieChart,
    Separator,
    type ChartConfig,
} from '../../atoms'

export type DeviceNodeData = Node<HostBaseData>
export type GraphDeviceNodeProps = {
    className?: string
} & NodeProps<DeviceNodeData>

type ConnectionChartDatum = {
    key: string
    targetMac: string
    packets: number
    fill: string
}

const CHART_COLORS = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
] as const

const getChartColor = (index: number) =>
    CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0]

const DEVICE_TYPE_LABELS: Record<HostBaseData['type'], string> = {
    host: 'Host',
    router: 'Router',
    me: 'This device',
}

const DEVICE_TYPE_ICONS: Record<HostBaseData['type'], typeof Computer> = {
    host: Computer,
    router: Router,
    me: Monitor,
}

const DEVICE_TYPE_BADGE_VARIANTS: Record<
    HostBaseData['type'],
    'default' | 'secondary' | 'outline'
> = {
    host: 'outline',
    router: 'secondary',
    me: 'default',
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
    const connectionsChartData: ConnectionChartDatum[] = sortedConnections.map(
        ([targetMac, linkData], index) => ({
            key: `peer${index + 1}`,
            targetMac,
            packets: linkData.numPacketsSend + linkData.numPacketsReceived,
            fill: getChartColor(index),
        }),
    )
    const connectionsChartConfig = connectionsChartData.reduce((config, connection, index) => {
        config[connection.key] = {
            label: connection.targetMac,
            color: getChartColor(index),
        }

        return config
    }, {} as ChartConfig)

    return (
        <Drawer direction="right">
            <DrawerTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className={cn('relative size-12.5 rounded-full', className)}
                    tabIndex={0}
                >
                    <DeviceIcon className={cn('size-6', { 'text-primary': data.type === 'me' })} />
                    <Handle type="source" position={Position.Top} className="hidden" />
                    <p className="absolute top-[calc(100%+0.5rem)] flex flex-col">
                        <span>{primaryLabel}</span>
                        <span>
                            {primaryLabel
                                ? primaryLabel.slice(0, 15) +
                                  (primaryLabel.length > 15 ? '...' : '')
                                : ''}
                        </span>
                        <span>
                            {vendor ? vendor.slice(0, 10) + (vendor.length > 10 ? '...' : '') : ''}
                        </span>
                    </p>
                </Button>
            </DrawerTrigger>
            <DrawerContent className="h-full w-[min(92vw,30rem)] rounded-r-2xl border-r p-0 sm:max-w-none">
                <DrawerHeader className="border-b px-6 py-5 text-left">
                    <div className="flex items-center gap-4 pr-8">
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

                <div className="no-scrollbar space-y-6 overflow-y-auto px-6 py-6">
                    <OverviewSection
                        totalPeers={totalPeers}
                        totalSent={totalSent}
                        totalReceived={totalReceived}
                    />

                    <HostDetailsSection
                        mac={mac}
                        vendor={vendor}
                        ipv4={ipv4}
                        ipv6={ipv6}
                        totalPackets={totalPackets}
                    />

                    <Separator />

                    <TrafficRepartitionSection
                        connectionsChartData={connectionsChartData}
                        connectionsChartConfig={connectionsChartConfig}
                        totalPackets={totalPackets}
                    />

                    <Separator />

                    <ObservedConnectionsSection sortedConnections={sortedConnections} />
                </div>

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

type OverviewSectionProps = {
    totalPeers: number
    totalSent: number
    totalReceived: number
}

const OverviewSection = (props: OverviewSectionProps) => {
    const { totalPeers, totalSent, totalReceived } = props

    return (
        <section className="grid grid-cols-3 gap-3">
            <MetricCard label="Peers" value={totalPeers} />
            <MetricCard label="Sent" value={totalSent} />
            <MetricCard label="Received" value={totalReceived} />
        </section>
    )
}

type HostDetailsSectionProps = {
    mac: string
    vendor: string
    ipv4?: string
    ipv6?: string
    totalPackets: number
}

const HostDetailsSection = (props: HostDetailsSectionProps) => {
    const { mac, vendor, ipv4, ipv6, totalPackets } = props

    return (
        <section className="space-y-3">
            <SectionTitle icon={EthernetPort} title="Host details" />
            <div className="space-y-3">
                <DetailRow label="MAC" value={mac} monospace={true} />
                <DetailRow label="Vendor" value={vendor || 'Unknown vendor'} />
                <DetailRow label="IPv4" value={ipv4 || 'Not detected yet'} monospace={!!ipv4} />
                <DetailRow label="IPv6" value={ipv6 || 'Not detected yet'} monospace={!!ipv6} />
                <DetailRow label="Traffic" value={`${totalPackets} packets observed`} />
            </div>
        </section>
    )
}

type TrafficRepartitionSectionProps = {
    connectionsChartData: ConnectionChartDatum[]
    connectionsChartConfig: ChartConfig
    totalPackets: number
}

const TrafficRepartitionSection = (props: TrafficRepartitionSectionProps) => {
    const { connectionsChartData, connectionsChartConfig, totalPackets } = props

    return (
        <section className="space-y-3">
            <SectionTitle icon={ChartPie} title="Traffic repartition" />
            {connectionsChartData.length > 0 ? (
                <div className="bg-card rounded-xl border p-4">
                    <ChartContainer
                        config={connectionsChartConfig}
                        className="[&_.recharts-pie-label-text]:fill-foreground mx-auto min-h-60 w-full"
                    >
                        <PieChart accessibilityLayer>
                            <Pie
                                data={connectionsChartData}
                                dataKey="packets"
                                nameKey="targetMac"
                                innerRadius={58}
                                outerRadius={90}
                                strokeWidth={3}
                                labelLine={true}
                                label={({ percent }) => {
                                    if (!percent || percent < 0.04) {
                                        return ''
                                    }
                                    return `${(percent * 100).toFixed(0)}%`
                                }}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={
                                    <ChartTooltipContent
                                        nameKey="targetMac"
                                        hideLabel={true}
                                        formatter={(value, name) => {
                                            const packets = Number(value)
                                            const percentage = totalPackets
                                                ? ((packets / totalPackets) * 100).toFixed(1)
                                                : '0.0'

                                            return [
                                                `${packets.toLocaleString()} packets (${percentage}%)`,
                                                name,
                                            ]
                                        }}
                                    />
                                }
                            />
                        </PieChart>
                    </ChartContainer>
                </div>
            ) : (
                <EmptyStateCard
                    title="No traffic distribution available yet"
                    description="The chart will appear once this host exchanges packets."
                />
            )}
        </section>
    )
}

type ObservedConnectionsSectionProps = {
    sortedConnections: Array<
        [
            string,
            {
                numPacketsSend: number
                numPacketsReceived: number
            },
        ]
    >
}

const ObservedConnectionsSection = (props: ObservedConnectionsSectionProps) => {
    const { sortedConnections } = props

    return (
        <section className="space-y-3">
            <SectionTitle icon={Wifi} title="Observed connections" />
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
                <EmptyStateCard
                    title="No connection detected yet"
                    description="Keep the capture running to enrich this device profile."
                />
            )}
        </section>
    )
}

type SectionTitleProps = {
    icon: typeof EthernetPort
    title: string
}

const SectionTitle = (props: SectionTitleProps) => {
    const { icon: Icon, title } = props

    return (
        <div className="flex items-center gap-2">
            <Icon className="text-muted-foreground size-4" />
            <h3 className="text-sm font-semibold">{title}</h3>
        </div>
    )
}

type MetricCardProps = {
    label: string
    value: number
}

const MetricCard = (props: MetricCardProps) => {
    const { label, value } = props

    return (
        <div className="bg-card rounded-xl border px-4 py-3">
            <p className="text-muted-foreground text-[11px] tracking-[0.18em] uppercase">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
    )
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

type EmptyStateCardProps = {
    title: string
    description: string
}

const EmptyStateCard = (props: EmptyStateCardProps) => {
    const { title, description } = props

    return (
        <div className="bg-muted/30 rounded-xl border border-dashed px-4 py-6 text-center">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
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

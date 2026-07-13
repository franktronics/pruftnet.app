import type { CaptureStats } from '@repo/shared/capture'
import {
    Button,
    ChartCartesianGrid,
    ChartContainer,
    ChartLine,
    ChartLineChart,
    ChartTooltip,
    ChartXAxis,
    ChartYAxis,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    type ChartConfig,
} from '@repo/ui'
import { Sparkline } from '@repo/ui/organisms'
import {
    Activity,
    CircleCheck,
    CircleStop,
    Database,
    HardDrive,
    Info,
    Maximize2,
    TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import {
    appendCaptureStatsSample,
    chartNumber,
    MAX_STATS_SAMPLES,
    type CaptureStatsSample,
} from '#front/pages/capture/model/capture-stats-history'
import { formatCount } from '#front/pages/capture/model/packet-view'
import { PanelShell } from './panel-shell'

const trafficSeries = [
    { dataKey: 'observed', color: 'var(--chart-1)' },
    { dataKey: 'persisted', color: 'var(--chart-2)' },
    { dataKey: 'analyzed', color: 'var(--chart-3)' },
] as const
const pressureSeries = [{ dataKey: 'pressure', color: 'var(--chart-4)' }] as const
const trafficChartConfig = {
    observed: { label: 'Observed', color: 'var(--chart-1)' },
    persisted: { label: 'Persisted', color: 'var(--chart-2)' },
    analyzed: { label: 'Analyzed', color: 'var(--chart-3)' },
} satisfies ChartConfig

type CaptureStatsEnvironment = 'dashboard' | 'modal'

type CaptureChartPoint = {
    at: number
    index: number
    observed: number | null
    persisted: number | null
    analyzed: number | null
    pressure: number
}

type Metric = {
    label: string
    value: string
    tooltip: string
    tone?: 'danger' | 'retention' | 'normal'
}

export function CaptureStatsPanel({ stats, state }: { stats?: CaptureStats; state?: string }) {
    const [history, setHistory] = useState<readonly CaptureStatsSample[]>([])
    const [dialogOpen, setDialogOpen] = useState(false)
    const reducedMotion = useReducedMotion()
    useEffect(() => {
        if (!stats) return
        const frame = requestAnimationFrame(() =>
            setHistory((current) => appendCaptureStatsSample(current, stats, Date.now())),
        )
        return () => cancelAnimationFrame(frame)
    }, [stats])

    if (!stats)
        return (
            <PanelShell title="Statistics" showHeader={false}>
                <div className="text-muted-foreground grid h-full place-items-center text-xs">
                    {state ? 'Waiting for capture counters' : 'Capture is idle'}
                </div>
            </PanelShell>
        )

    const active = state === 'starting' || state === 'running' || state === 'stopping'
    const status = pipelineStatus(stats, state, active)

    return (
        <PanelShell title="Statistics" showHeader={false}>
            <div className="h-full overflow-auto p-3">
                <CaptureStatsContent
                    environment="dashboard"
                    stats={stats}
                    history={history}
                    active={active}
                    reducedMotion={reducedMotion}
                    status={status}
                    onOpenDialog={() => setDialogOpen(true)}
                />
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="h-[min(90vh,920px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-5xl">
                    <DialogHeader className="border-b px-6 py-4 pr-14">
                        <DialogTitle>Capture statistics</DialogTitle>
                        <DialogDescription>
                            Inspect capture throughput, queue pressure, persistence, and analysis
                            health from the same live statistics ledger.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 overflow-y-auto px-6 py-5">
                        <CaptureStatsContent
                            environment="modal"
                            stats={stats}
                            history={history}
                            active={active}
                            reducedMotion={reducedMotion}
                            status={status}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </PanelShell>
    )
}

function CaptureStatsContent({
    environment,
    stats,
    history,
    active,
    reducedMotion,
    status,
    onOpenDialog,
}: {
    environment: CaptureStatsEnvironment
    stats: CaptureStats
    history: readonly CaptureStatsSample[]
    active: boolean
    reducedMotion: boolean
    status: ReturnType<typeof pipelineStatus>
    onOpenDialog?: () => void
}) {
    const expanded = environment === 'modal'
    const latest = history.at(-1)
    const chartData = history.map((sample, index) => ({
        at: sample.at,
        index,
        observed: chartNumber(sample.observedRate),
        persisted: chartNumber(sample.persistedRate),
        analyzed: chartNumber(sample.analyzedRate),
        pressure: sample.captureQueuePressure,
    }))
    const titleSuffix = expanded ? 'modal' : 'dashboard'

    return (
        <>
            <PipelineStatus
                status={status}
                action={
                    onOpenDialog ? (
                        <Tooltip>
                            <TooltipTrigger
                                render={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Open expanded statistics"
                                        onClick={onOpenDialog}
                                    >
                                        <Maximize2 />
                                    </Button>
                                }
                            />
                            <TooltipContent>Open expanded statistics</TooltipContent>
                        </Tooltip>
                    ) : null
                }
            />

            <section className="mt-4" aria-labelledby={`capture-rate-title-${titleSuffix}`}>
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h3
                            id={`capture-rate-title-${titleSuffix}`}
                            className="text-muted-foreground text-xs font-medium"
                        >
                            Commit throughput
                        </h3>
                        <p className="mt-0.5 font-mono text-lg leading-none font-medium tabular-nums">
                            {latest?.persistedRate === undefined
                                ? '—'
                                : `${formatCount(latest.persistedRate)}/s`}
                        </p>
                    </div>
                    <div className="text-muted-foreground flex gap-3 text-[11px]">
                        <ChartKey color="bg-chart-1" label="Observed" />
                        <ChartKey color="bg-chart-2" label="Persisted" />
                        <ChartKey color="bg-chart-3" label="Analyzed" />
                    </div>
                </div>
                {expanded ? (
                    <DetailedTrafficChart data={chartData} animated={active && !reducedMotion} />
                ) : (
                    <Sparkline
                        data={chartData}
                        series={trafficSeries}
                        ariaLabel="Observed, persisted, and analyzed packets per second"
                        className="mt-2 h-16"
                        animated={active && !reducedMotion}
                    />
                )}
            </section>

            <section
                className={expanded ? 'mt-5' : 'mt-3 border-t pt-3'}
                aria-labelledby={`queue-pressure-title-${titleSuffix}`}
            >
                <div className="flex items-center justify-between gap-2">
                    <h3
                        id={`queue-pressure-title-${titleSuffix}`}
                        className="text-muted-foreground text-xs font-medium"
                    >
                        Capture queue pressure
                    </h3>
                    <span className="font-mono text-xs tabular-nums">
                        {(latest?.captureQueuePressure ?? 0).toFixed(1)}%
                    </span>
                </div>
                <Sparkline
                    data={chartData}
                    series={pressureSeries}
                    ariaLabel="Maximum packet or byte pressure across interface capture queues"
                    className={expanded ? 'mt-1 h-14' : 'mt-1 h-10'}
                    animated={active && !reducedMotion}
                    domain={[0, 100]}
                />
            </section>

            <div
                className={expanded ? 'mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2' : 'mt-3 space-y-2'}
            >
                <LedgerSection
                    title="Capture source"
                    icon={Activity}
                    metrics={[
                        metric(
                            'Observed',
                            stats.packetsObserved,
                            'Counted in the libpcap callback. These packets reached Pruftnet; upstream NIC or kernel loss is not included.',
                        ),
                        metric(
                            'Kernel loss',
                            stats.pcapKernelDrops,
                            'Reported by libpcap. This is permanent loss before the application queue. Increase the capture buffer or reduce system load.',
                            'danger',
                        ),
                        metric(
                            'Interface loss',
                            stats.pcapInterfaceDrops,
                            'Raw libpcap interface-drop counter. Platform semantics vary; any reported packets are permanently unavailable.',
                            'danger',
                        ),
                        metric(
                            'Dispatch errors',
                            stats.pcapDispatchErrors,
                            'Failures returned by pcap_dispatch. The affected dispatch may be incomplete; inspect capture events and interface health.',
                            'danger',
                        ),
                        metric(
                            'Invalid payload',
                            stats.invalidCallbackDrops,
                            'Permanent rejection in the libpcap callback because metadata and packet bytes were inconsistent. This indicates a capture-source or internal contract failure.',
                            'danger',
                        ),
                    ]}
                />
                <LedgerSection
                    title="Capture queue"
                    icon={Database}
                    metrics={[
                        metric(
                            'Accepted',
                            stats.captureQueueAccepted,
                            'Packets copied into a per-interface SPSC queue before parsing. Accepted packets are destined for the spool writer.',
                        ),
                        metric(
                            'Queue full',
                            stats.captureQueueFullDrops,
                            'Permanent application loss because an interface queue reached its packet or byte capacity. Increase queue bytes or improve disk throughput.',
                            'danger',
                        ),
                        metric(
                            'Oversize',
                            stats.captureQueueOversizeDrops,
                            'Permanent rejection because one packet exceeded the queue byte capacity. Increase per-interface queue bytes or reduce snap length.',
                            'danger',
                        ),
                        metric(
                            'Current',
                            `${formatCount(stats.captureQueueDepth)} pkt · ${formatBytes(stats.captureQueueBytes)}`,
                            'Packets currently waiting for the serialized pcapng writer. This pressure is recoverable while the queue has capacity.',
                        ),
                    ]}
                />
                <LedgerSection
                    title="Persistence"
                    icon={HardDrive}
                    metrics={[
                        metric(
                            'Persisted',
                            stats.packetsPersisted,
                            'Packets published as committed only after complete pcapng blocks were written and the controlled flush succeeded.',
                        ),
                        metric(
                            'Disk retained',
                            formatBytes(stats.spoolBytesRetained),
                            'Current bytes retained across live pcapng segments. This is the authoritative raw capture.',
                        ),
                        metric(
                            'Write failures',
                            add(stats.spoolWriteFailures, stats.spoolFlushFailures),
                            'Unrecoverable write or flush failures stop capture. The valid pcapng prefix remains readable.',
                            'danger',
                        ),
                        metric(
                            'Unpersisted',
                            `${formatCount(stats.terminalWriteLosses)} pkt`,
                            'Packets accepted by capture queues but not committed after a terminal writer failure. These packets are permanently unavailable.',
                            'danger',
                        ),
                        metric(
                            'Retention evicted',
                            `${formatCount(stats.spoolEvictedPackets)} pkt`,
                            'Intentional bounded-spool eviction. This is retention, not capture loss; increase the quota or disable disk ring mode to keep older packets.',
                            'retention',
                        ),
                    ]}
                />
                <LedgerSection
                    title="Analysis"
                    icon={Database}
                    metrics={[
                        metric(
                            'Analyzed',
                            stats.packetsAnalyzed,
                            'Committed packets successfully dissected by the asynchronous analyzer.',
                        ),
                        metric(
                            'Backlog',
                            `${formatCount(stats.analysisBacklogPackets)} pkt · ${formatBytes(stats.analysisBacklogBytes)}`,
                            'Committed packets waiting for analysis. This is recoverable and does not cause raw packet loss while the spool retains them.',
                        ),
                        metric(
                            'Analysis gaps',
                            stats.analysisGapCount,
                            'Packets unavailable to the analyzer because retention removed them first or persisted data was invalid. Raw capture loss is counted elsewhere.',
                            'retention',
                        ),
                        metric(
                            'Errors',
                            stats.analysisErrors,
                            'Dissection, summary, or persisted-data errors. Capture continues because analysis is outside the loss-critical writer path.',
                        ),
                    ]}
                />
            </div>

            <ConservationLedger stats={stats} idSuffix={titleSuffix} />

            <div
                className={
                    expanded && stats.interfaces.length > 1 ? 'grid gap-x-8 lg:grid-cols-2' : ''
                }
            >
                {stats.interfaces.map((item) => (
                    <section key={item.interfaceId} className="mt-3 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-[13px] font-medium">
                                {item.interfaceName || `Interface ${item.interfaceId}`}
                            </h3>
                            <span
                                className={`text-xs ${item.captureThreadRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                            >
                                {item.captureThreadRunning ? 'capturing' : 'stopped'}
                            </span>
                        </div>
                        <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <div>
                                Queue{' '}
                                <StatValue>
                                    {item.captureQueueDepth}/{item.captureQueueCapacityPackets}
                                </StatValue>
                            </div>
                            <div>
                                Bytes <StatValue>{formatBytes(item.captureQueueBytes)}</StatValue>
                            </div>
                            <div>
                                Peak <StatValue>{item.captureQueueMaxDepth}</StatValue>
                            </div>
                            <div>
                                Lost{' '}
                                <StatValue>
                                    {formatCount(
                                        add(
                                            item.captureQueueFullDrops,
                                            item.captureQueueOversizeDrops,
                                        ),
                                    )}
                                </StatValue>
                            </div>
                        </dl>
                    </section>
                ))}
            </div>
        </>
    )
}

function DetailedTrafficChart({
    data,
    animated,
}: {
    data: CaptureChartPoint[]
    animated: boolean
}) {
    const visibleDuration = data.length > 1 ? data.at(-1)!.at - data[0]!.at : 0
    return (
        <div className="mt-4">
            <ChartContainer
                config={trafficChartConfig}
                className="aspect-auto h-72 w-full"
                initialDimension={{ width: 900, height: 288 }}
            >
                <ChartLineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <ChartCartesianGrid vertical={false} strokeDasharray="3 3" />
                    <ChartXAxis
                        dataKey="at"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        minTickGap={36}
                        tickFormatter={(value) => formatChartTime(Number(value), true)}
                    />
                    <ChartYAxis
                        width={52}
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tickFormatter={(value) => formatChartRate(Number(value))}
                    />
                    <ChartTooltip
                        cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
                        content={<CaptureRateTooltip />}
                    />
                    <ChartLine
                        type="monotone"
                        dataKey="observed"
                        stroke="var(--color-observed)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={animated}
                    />
                    <ChartLine
                        type="monotone"
                        dataKey="persisted"
                        stroke="var(--color-persisted)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={animated}
                    />
                    <ChartLine
                        type="monotone"
                        dataKey="analyzed"
                        stroke="var(--color-analyzed)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={animated}
                    />
                </ChartLineChart>
            </ChartContainer>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span>{formatDuration(visibleDuration)} visible</span>
                <span>
                    Rolling window · {data.length}/{MAX_STATS_SAMPLES} samples · oldest samples are
                    replaced
                </span>
            </div>
        </div>
    )
}

function CaptureRateTooltip({
    active,
    label,
    payload,
}: {
    active?: boolean
    label?: number | string
    payload?: readonly {
        color?: string
        dataKey?: number | string
        value?: number | string
    }[]
}) {
    const timestamp = Number(label)
    if (!active || !payload?.length || !Number.isFinite(timestamp)) return null
    return (
        <div className="border-border/50 bg-background min-w-40 rounded-lg border px-2.5 py-2 text-xs shadow-xl">
            <div className="font-medium">{formatChartTime(timestamp, true)}</div>
            <div className="mt-1.5 grid gap-1.5">
                {payload.map((item) => {
                    const key = String(item.dataKey ?? '')
                    const config = trafficChartConfig[key as keyof typeof trafficChartConfig]
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <span
                                className="size-2 rounded-[2px]"
                                style={{ backgroundColor: item.color }}
                            />
                            <span className="text-muted-foreground flex-1">{config?.label}</span>
                            <span className="font-mono font-medium tabular-nums">
                                {typeof item.value === 'number'
                                    ? item.value.toLocaleString()
                                    : item.value}{' '}
                                pkt/s
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function metric(
    label: string,
    value: string,
    tooltip: string,
    tone: Metric['tone'] = 'normal',
): Metric {
    return { label, value: value.match(/^\d+$/) ? formatCount(value) : value, tooltip, tone }
}

function LedgerSection({
    title,
    icon: Icon,
    metrics,
}: {
    title: string
    icon: typeof Activity
    metrics: readonly Metric[]
}) {
    return (
        <section className="py-1.5">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                <Icon className="size-3" />
                {title}
            </h3>
            <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {metrics.map((item) => (
                    <div
                        key={item.label}
                        className="group/metric flex min-w-0 items-baseline justify-between gap-2 text-xs"
                    >
                        <dt className="text-muted-foreground flex min-w-0 items-center gap-1">
                            <span className="truncate">{item.label}</span>
                            <MetricHelp text={item.tooltip} />
                        </dt>
                        <dd
                            className={
                                item.tone === 'danger'
                                    ? 'text-destructive shrink-0 font-mono tabular-nums'
                                    : item.tone === 'retention'
                                      ? 'shrink-0 font-mono text-amber-700 tabular-nums dark:text-amber-400'
                                      : 'shrink-0 font-mono tabular-nums'
                            }
                        >
                            {item.value}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    )
}

function MetricHelp({ text }: { text: string }) {
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        aria-label="Explain metric"
                        className="hover:text-foreground focus-visible:ring-ring rounded-sm opacity-0 transition-opacity group-hover/metric:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                    >
                        <Info className="size-2.5" />
                    </button>
                }
            />
            <TooltipContent side="left" className="max-w-72 leading-relaxed">
                {text}
            </TooltipContent>
        </Tooltip>
    )
}

function ConservationLedger({ stats, idSuffix }: { stats: CaptureStats; idSuffix: string }) {
    const equations = [
        {
            label: 'Observed',
            left: BigInt(stats.packetsObserved),
            right: sum(
                stats.captureQueueAccepted,
                stats.captureQueueFullDrops,
                stats.captureQueueOversizeDrops,
                stats.invalidCallbackDrops,
            ),
        },
        {
            label: 'Queue',
            left: BigInt(stats.captureQueueAccepted),
            right: sum(
                stats.packetsPersisted,
                stats.captureQueueDepth,
                stats.writerInFlight,
                stats.terminalWriteLosses,
            ),
        },
        {
            label: 'Analysis',
            left: BigInt(stats.packetsPersisted),
            right: sum(
                stats.packetsAnalyzed,
                stats.analysisBacklogPackets,
                stats.analysisEvictedBeforeAnalysis,
                stats.analysisRejects,
            ),
        },
    ]
    return (
        <section className="mt-3 border-t pt-3" aria-labelledby={`conservation-title-${idSuffix}`}>
            <div className="flex items-center justify-between">
                <h3
                    id={`conservation-title-${idSuffix}`}
                    className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase"
                >
                    Packet conservation
                </h3>
                <span className="text-muted-foreground text-[10px]">snapshot</span>
            </div>
            <div className="mt-1.5 space-y-1">
                {equations.map((equation) => {
                    const balanced = equation.left === equation.right
                    return (
                        <div
                            key={equation.label}
                            className="flex items-center justify-between font-mono text-[11px] tabular-nums"
                        >
                            <span className="text-muted-foreground">{equation.label}</span>
                            <span className={balanced ? 'text-emerald-600' : 'text-amber-600'}>
                                {formatCount(equation.left)} {balanced ? '=' : '≠'}{' '}
                                {formatCount(equation.right)}
                            </span>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function PipelineStatus({
    status,
    action,
}: {
    status: ReturnType<typeof pipelineStatus>
    action?: React.ReactNode
}) {
    const Icon =
        status.tone === 'healthy'
            ? CircleCheck
            : status.tone === 'neutral'
              ? CircleStop
              : TriangleAlert
    const color =
        status.tone === 'healthy'
            ? 'text-emerald-700 dark:text-emerald-400'
            : status.tone === 'error'
              ? 'text-destructive'
              : status.tone === 'warning'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground'
    return (
        <div className="flex min-h-7 items-center justify-between gap-3">
            <div className={`flex items-center gap-2 text-xs font-medium ${color}`} role="status">
                <Icon className="size-3.5 shrink-0" />
                <span>{status.message}</span>
            </div>
            {action}
        </div>
    )
}

function ChartKey({ color, label }: { color: string; label: string }) {
    return (
        <span className="flex items-center gap-1">
            <span className={`size-1.5 rounded-full ${color}`} /> {label}
        </span>
    )
}

function StatValue({ children }: { children: React.ReactNode }) {
    return <span className="text-foreground font-mono tabular-nums">{children}</span>
}

function pipelineStatus(stats: CaptureStats, state: string | undefined, active: boolean) {
    if (state === 'failed') return { tone: 'error' as const, message: 'Capture failed' }
    if (BigInt(stats.spoolWriteFailures) + BigInt(stats.spoolFlushFailures) > 0n)
        return { tone: 'error' as const, message: 'Capture stopped by a spool failure' }
    if (active && !stats.writerRunning)
        return { tone: 'error' as const, message: 'Capture writer is not running' }
    const queueLoss = BigInt(stats.captureQueueFullDrops) + BigInt(stats.captureQueueOversizeDrops)
    if (queueLoss > 0n)
        return {
            tone: 'warning' as const,
            message: `${formatCount(queueLoss)} packets lost at capture queues`,
        }
    const sourceLoss = BigInt(stats.pcapKernelDrops) + BigInt(stats.pcapInterfaceDrops)
    if (sourceLoss > 0n)
        return {
            tone: 'warning' as const,
            message: `${formatCount(sourceLoss)} packets lost before application capture`,
        }
    if (active && BigInt(stats.analysisBacklogPackets) > 0n)
        return {
            tone: 'healthy' as const,
            message: `Capture committed; analysis is ${formatCount(stats.analysisBacklogPackets)} packets behind`,
        }
    if (active) return { tone: 'healthy' as const, message: 'Capture writer is keeping up' }
    return { tone: 'neutral' as const, message: 'Capture is stopped' }
}

function add(...values: readonly string[]) {
    return values.reduce((total, value) => total + BigInt(value), 0n).toString()
}

function sum(...values: readonly string[]) {
    return values.reduce((total, value) => total + BigInt(value), 0n)
}

function formatBytes(value: string) {
    const bytes = BigInt(value)
    const units = [
        ['TiB', 1024n ** 4n],
        ['GiB', 1024n ** 3n],
        ['MiB', 1024n ** 2n],
        ['KiB', 1024n],
    ] as const
    for (const [unit, size] of units)
        if (bytes >= size) return `${Number((bytes * 10n) / size) / 10} ${unit}`
    return `${bytes} B`
}

function formatChartTime(value: number, includeSeconds = false) {
    const date = new Date(value)
    return date.toLocaleTimeString(
        [],
        includeSeconds
            ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
            : { hour: '2-digit', minute: '2-digit' },
    )
}

function formatChartRate(value: number) {
    return new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value)
}

function formatDuration(milliseconds: number) {
    if (milliseconds < 1_000) return '<1 s'
    const seconds = Math.round(milliseconds / 1_000)
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    const remainder = seconds % 60
    return remainder === 0 ? `${minutes} min` : `${minutes} min ${remainder} s`
}

function useReducedMotion() {
    const [reduced, setReduced] = useState(false)
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReduced(query.matches)
        update()
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])
    return reduced
}

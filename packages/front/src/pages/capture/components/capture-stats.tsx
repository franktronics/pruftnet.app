import type { CaptureStats } from '@repo/shared/capture'
import { Sparkline } from '@repo/ui/organisms'
import { CircleCheck, CircleStop, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
    appendCaptureStatsSample,
    chartNumber,
    type CaptureStatsSample,
} from '#front/pages/capture/model/capture-stats-history'
import { formatCount } from '#front/pages/capture/model/packet-view'
import { PanelShell } from './panel-shell'

const trafficSeries = [
    { dataKey: 'seen', color: 'var(--chart-1)' },
    { dataKey: 'parsed', color: 'var(--chart-2)' },
] as const
const pressureSeries = [{ dataKey: 'pressure', color: 'var(--chart-3)' }] as const

export function CaptureStatsPanel({ stats, state }: { stats?: CaptureStats; state?: string }) {
    const [history, setHistory] = useState<readonly CaptureStatsSample[]>([])
    const reducedMotion = useReducedMotion()
    useEffect(() => {
        if (!stats) return
        const frame = requestAnimationFrame(() =>
            setHistory((current) => appendCaptureStatsSample(current, stats, performance.now())),
        )
        return () => cancelAnimationFrame(frame)
    }, [stats])

    if (!stats)
        return (
            <PanelShell title="Statistics" showHeader={false}>
                <div className="text-muted-foreground grid h-full place-items-center text-xs">
                    {state ? 'Waiting for counters' : 'Capture is idle'}
                </div>
            </PanelShell>
        )

    const active = state === 'starting' || state === 'running' || state === 'stopping'
    const latest = history.at(-1)
    const status = pipelineStatus(stats, state, active)
    const chartData = history.map((sample, index) => ({
        index,
        seen: chartNumber(sample.seenRate),
        parsed: chartNumber(sample.parsedRate),
        pressure: sample.ringPressure,
    }))
    const metricGroups = [
        {
            title: 'Traffic',
            items: [
                ['Packets seen', formatCount(stats.packetsSeen)],
                [
                    'Current rate',
                    latest?.seenRate === undefined ? '—' : `${formatCount(latest.seenRate)}/s`,
                ],
            ],
        },
        {
            title: 'Pipeline',
            items: [
                ['Enqueued', formatCount(stats.packetsEnqueued)],
                ['Parsed', formatCount(stats.packetsParsed)],
                ['Parser', stats.parserThreadRunning ? 'running' : 'stopped'],
            ],
        },
        {
            title: 'Retention',
            items: [
                ['Packets', formatCount(stats.retainedPackets)],
                ['Bytes', formatCount(stats.retainedBytes)],
                ['Evictions', formatCount(stats.retentionEvictions)],
                ['Rejected', formatCount(stats.retentionRejected)],
            ],
        },
        {
            title: 'Losses',
            items: [
                ['App ring', formatCount(stats.appRingDrops)],
                ['pcap', formatCount(stats.pcapDropped)],
                ['Interface', formatCount(stats.pcapInterfaceDropped)],
                ['IPC', formatCount(stats.ipcDrops)],
            ],
        },
    ]

    return (
        <PanelShell title="Statistics" showHeader={false}>
            <div className="h-full overflow-auto p-3">
                <PipelineStatus status={status} />

                <section className="mt-4" aria-labelledby="traffic-history-title">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <h3
                                id="traffic-history-title"
                                className="text-muted-foreground text-xs font-medium"
                            >
                                Packet throughput
                            </h3>
                            <p className="mt-0.5 font-mono text-lg leading-none font-medium tabular-nums">
                                {latest?.seenRate === undefined
                                    ? '—'
                                    : `${formatCount(latest.seenRate)}/s`}
                            </p>
                        </div>
                        <div className="text-muted-foreground flex gap-3 text-[11px]">
                            <ChartKey color="bg-chart-1" label="Seen" />
                            <ChartKey color="bg-chart-2" label="Parsed" />
                        </div>
                    </div>
                    <Sparkline
                        data={chartData}
                        series={trafficSeries}
                        ariaLabel="Packets seen and parsed per second over the last two minutes"
                        className="mt-2 h-16"
                        animated={active && !reducedMotion}
                    />
                </section>

                <section className="mt-3 border-t pt-3" aria-labelledby="ring-pressure-title">
                    <div className="flex items-center justify-between gap-2">
                        <h3
                            id="ring-pressure-title"
                            className="text-muted-foreground text-xs font-medium"
                        >
                            Ring pressure
                        </h3>
                        <span className="font-mono text-xs tabular-nums">
                            {(latest?.ringPressure ?? 0).toFixed(1)}%
                        </span>
                    </div>
                    <Sparkline
                        data={chartData}
                        series={pressureSeries}
                        ariaLabel="Maximum interface ring pressure over the last two minutes"
                        className="mt-1 h-10"
                        animated={active && !reducedMotion}
                        domain={[0, 100]}
                    />
                </section>

                <div className="mt-2">
                    {metricGroups.map((group) => (
                        <MetricGroup key={group.title} title={group.title} items={group.items} />
                    ))}
                </div>

                {stats.interfaces.map((item) => (
                    <section key={item.interfaceId} className="mt-3 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-[13px] font-medium">
                                {item.interfaceName || `Interface ${item.interfaceId}`}
                            </h3>
                            <span
                                className={`text-xs ${item.captureThreadRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                            >
                                {item.captureThreadRunning ? 'running' : 'stopped'}
                            </span>
                        </div>
                        <dl className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                            <div>
                                Ring{' '}
                                <StatValue>
                                    {item.ringDepth}/{item.ringCapacity}
                                </StatValue>
                            </div>
                            <div>
                                Peak <StatValue>{item.maxRingDepth}</StatValue>
                            </div>
                            <div>
                                Parsed <StatValue>{formatCount(item.packetsParsed)}</StatValue>
                            </div>
                            <div>
                                Drops <StatValue>{formatCount(item.appRingDrops)}</StatValue>
                            </div>
                        </dl>
                    </section>
                ))}
            </div>
        </PanelShell>
    )
}

function MetricGroup({ title, items }: { title: string; items: readonly (readonly string[])[] }) {
    return (
        <section className="border-t py-3">
            <h3 className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                {title}
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {items.map(([label, value]) => (
                    <div
                        key={label}
                        className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
                    >
                        <dt className="text-muted-foreground truncate">{label}</dt>
                        <dd className="shrink-0 font-mono tabular-nums">{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    )
}

function PipelineStatus({ status }: { status: ReturnType<typeof pipelineStatus> }) {
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
        <div className={`flex items-center gap-2 text-xs font-medium ${color}`} role="status">
            <Icon className="size-3.5 shrink-0" />
            <span>{status.message}</span>
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
    if (active && !stats.parserThreadRunning)
        return { tone: 'warning' as const, message: 'Parser thread stopped' }

    const losses = [
        [stats.ipcDrops, 'packets dropped by IPC'],
        [stats.appRingDrops, 'packets dropped by the application ring'],
        [stats.pcapDropped, 'packets dropped by pcap'],
        [stats.pcapInterfaceDropped, 'packets dropped by the interface'],
        [stats.retentionRejected, 'packets rejected by retention'],
    ] as const
    const loss = losses.find(([value]) => BigInt(value) > 0n)
    if (loss)
        return {
            tone: 'warning' as const,
            message: `${formatCount(loss[0])} ${loss[1]}`,
        }
    if (active) return { tone: 'healthy' as const, message: 'Capture pipeline healthy' }
    return { tone: 'neutral' as const, message: 'Capture is stopped' }
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

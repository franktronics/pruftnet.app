import {
    ChartCartesianGrid,
    ChartContainer,
    ChartLine,
    ChartLineChart,
    ChartTooltip,
    ChartXAxis,
    ChartYAxis,
    type ChartConfig,
} from '@repo/ui/chart'

import { MAX_STATS_SAMPLES } from '#front/pages/capture/model/capture-stats-history'

const trafficChartConfig = {
    observed: { label: 'Observed', color: 'var(--chart-1)' },
    persisted: { label: 'Persisted', color: 'var(--chart-2)' },
    analyzed: { label: 'Analyzed', color: 'var(--chart-3)' },
} satisfies ChartConfig

export type CaptureChartPoint = {
    at: number
    index: number
    observed: number | null
    persisted: number | null
    analyzed: number | null
    pressure: number
}

export function DetailedTrafficChart({ data }: { data: CaptureChartPoint[] }) {
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
                        type="linear"
                        dataKey="observed"
                        stroke="var(--color-observed)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                    <ChartLine
                        type="linear"
                        dataKey="persisted"
                        stroke="var(--color-persisted)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                    <ChartLine
                        type="linear"
                        dataKey="analyzed"
                        stroke="var(--color-analyzed)"
                        strokeWidth={1.75}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                </ChartLineChart>
            </ChartContainer>
            <div className="text-muted-foreground mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
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

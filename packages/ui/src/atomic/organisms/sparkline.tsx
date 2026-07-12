import { cn } from '@repo/utils'

export interface SparklineSeries {
    dataKey: string
    color: string
}

const WIDTH = 240
const HEIGHT = 56
const PADDING = 2

export function Sparkline({
    data,
    series,
    ariaLabel,
    className,
    animated = false,
    domain = [0, 'auto'],
}: {
    data: readonly Record<string, number | null>[]
    series: readonly SparklineSeries[]
    ariaLabel: string
    className?: string
    animated?: boolean
    domain?: [number | 'auto', number | 'auto']
}) {
    const values = data.flatMap((item) =>
        series.flatMap(({ dataKey }) => {
            const value = item[dataKey]
            return value === null ? [] : [value]
        }),
    )
    const minimum = domain[0] === 'auto' ? Math.min(...values, 0) : domain[0]
    const maximum = domain[1] === 'auto' ? Math.max(...values, minimum + 1) : domain[1]
    const animationKey = data.at(-1)
        ? series.map(({ dataKey }) => data.at(-1)?.[dataKey] ?? 'null').join(':')
        : 'empty'

    return (
        <svg
            className={cn('h-14 w-full overflow-visible', className)}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={ariaLabel}
        >
            {series.map((item) => (
                <path
                    key={`${item.dataKey}:${animationKey}`}
                    d={sparklinePath(data, item.dataKey, minimum, maximum)}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                >
                    {animated ? (
                        <animate attributeName="opacity" from="0.55" to="1" dur="250ms" />
                    ) : null}
                </path>
            ))}
        </svg>
    )
}

function sparklinePath(
    data: readonly Record<string, number | null>[],
    dataKey: string,
    minimum: number,
    maximum: number,
): string {
    const width = WIDTH - PADDING * 2
    const height = HEIGHT - PADDING * 2
    const range = Math.max(1, maximum - minimum)
    const divisor = Math.max(1, data.length - 1)
    let drawing = false
    return data
        .map((item, index) => {
            const value = item[dataKey]
            if (value === null) {
                drawing = false
                return ''
            }
            const x = PADDING + (index / divisor) * width
            const y = PADDING + (1 - (value - minimum) / range) * height
            const command = drawing ? 'L' : 'M'
            drawing = true
            return `${command}${x.toFixed(2)},${y.toFixed(2)}`
        })
        .filter(Boolean)
        .join(' ')
}

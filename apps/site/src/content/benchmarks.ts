/**
 * Published performance figures. Each value is rounded down from the slowest of three runs of a
 * Release build. Re-measure and update this file together; the landing page renders it verbatim.
 */
export interface BenchmarkFigure {
    value: string
    unit: string
    label: string
    detail: string
}

export const benchmarkMachine = 'Apple M1 Pro, 16 GB, macOS 27, Release build, October 2026'

export const benchmarkFigures: BenchmarkFigure[] = [
    {
        value: '1.3',
        unit: 'M packets/s',
        label: 'Dissected on a single core',
        detail: 'packet_parser_benchmark: Ethernet / IPv4 / UDP frames, 31 fields each.',
    },
    {
        value: '180',
        unit: 'k packets/s',
        label: 'Captured, written to pcapng and dissected',
        detail: 'End-to-end replay of 982,100 packets of mixed DNS, TLS, QUIC and HTTP traffic.',
    },
    {
        value: '600',
        unit: 'MB/s',
        label: 'Durable pcapng writes',
        detail: 'sniffing_runtime_benchmark: 1,514 byte frames committed to the capture spool.',
    },
]

/** The overload run from the end-to-end replay: the source outpaced the capture queue on purpose. */
export const overloadLedger = {
    offered: 982_100,
    stored: 290_178,
    queueFull: 691_922,
}

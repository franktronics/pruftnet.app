// A small model of the capture pipeline behind the landing's statistics panel. It follows the
// application's ledger: packets observed by libpcap enter a bounded per-interface queue or are
// counted as `queue full`, the writer commits them to the spool, and the analyzer dissects them.
// Every packet stays in exactly one bucket, so the conservation equations always balance.

export const TICK_MS = 500
export const WINDOW = 120
export const QUEUE_CAPACITY = 1024

const PACKET_BYTES = 420
// Scaled to the published end-to-end figure (180k packets/s, src/content/benchmarks.ts).
const WRITER_RATE = 180_000
const ANALYZER_RATE = 160_000
const HISTORY_BASE = 4_812_330

export interface Sample {
    at: number
    observed: number
    persisted: number
    analyzed: number
    pressure: number
}

export interface Totals {
    observed: number
    accepted: number
    queueFull: number
    persisted: number
    analyzed: number
    depth: number
    backlog: number
    peak: number
}

export interface Simulation {
    random: () => number
    at: number
    overload: boolean
    totals: Totals
    samples: Sample[]
}

export type Tone = 'healthy' | 'warning'

function mulberry32(seed: number) {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let value = state
        value = Math.imul(value ^ (value >>> 15), value | 1)
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
        return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
    }
}

/** A capture that has been running for a while, with a full chart window ending at `now`. */
export function createSimulation(seed: number, now: number): Simulation {
    const simulation: Simulation = {
        random: mulberry32(seed),
        at: now - WINDOW * TICK_MS,
        overload: false,
        totals: {
            observed: HISTORY_BASE,
            accepted: HISTORY_BASE,
            queueFull: 0,
            persisted: HISTORY_BASE,
            analyzed: HISTORY_BASE,
            depth: 0,
            backlog: 0,
            peak: 214,
        },
        samples: [],
    }
    for (let tick = 0; tick < WINDOW; tick += 1) step(simulation)
    return simulation
}

export function step(simulation: Simulation): void {
    const seconds = TICK_MS / 1000
    const random = simulation.random
    const rate = simulation.overload
        ? 210_000 + random() * 30_000
        : 18_000 + random() * 22_000 + (random() < 0.08 ? 8_000 + random() * 12_000 : 0)
    const arrivals = Math.round(rate * seconds)
    const totals = simulation.totals
    // The writer drains the queue continuously, so a tick can accept what it writes plus the
    // free queue space; everything beyond that is a permanent, counted queue-full loss.
    const writer = WRITER_RATE * seconds
    const accepted = Math.min(arrivals, writer + QUEUE_CAPACITY - totals.depth)
    const persisted = Math.min(totals.depth + accepted, writer)
    totals.depth += accepted - persisted
    const analyzed = Math.min(totals.backlog + persisted, ANALYZER_RATE * seconds)
    totals.backlog += persisted - analyzed

    totals.observed += arrivals
    totals.accepted += accepted
    totals.queueFull += arrivals - accepted
    totals.persisted += persisted
    totals.analyzed += analyzed
    totals.peak = Math.max(totals.peak, totals.depth)

    simulation.at += TICK_MS
    simulation.samples.push({
        at: simulation.at,
        observed: arrivals / seconds,
        persisted: persisted / seconds,
        analyzed: analyzed / seconds,
        pressure: (totals.depth / QUEUE_CAPACITY) * 100,
    })
    if (simulation.samples.length > WINDOW) simulation.samples.shift()
}

/** Moves the timeline to `now` after the panel was paused, keeping the samples evenly spaced. */
export function resume(simulation: Simulation, now: number): void {
    const offset = now - simulation.at
    if (offset < 2 * TICK_MS) return
    simulation.at += offset
    for (const sample of simulation.samples) sample.at += offset
}

const count = new Intl.NumberFormat('en-US')

export function formatCount(value: number): string {
    return count.format(Math.round(value))
}

/** Binary units with one decimal, as in the application's statistics panel. */
export function formatBinaryBytes(value: number): string {
    const units = [
        ['GiB', 1024 ** 3],
        ['MiB', 1024 ** 2],
        ['KiB', 1024],
    ] as const
    for (const [unit, size] of units)
        if (value >= size) return `${Math.floor((value * 10) / size) / 10} ${unit}`
    return `${Math.round(value)} B`
}

export function ledger(simulation: Simulation) {
    const totals = simulation.totals
    const latest = simulation.samples.at(-1)
    const loss = totals.queueFull
    const status: { tone: Tone; message: string } =
        loss > 0
            ? { tone: 'warning', message: `${formatCount(loss)} packets lost at capture queues` }
            : totals.backlog > 0
              ? {
                    tone: 'healthy',
                    message: `Capture committed; analysis is ${formatCount(totals.backlog)} packets behind`,
                }
              : { tone: 'healthy', message: 'Capture writer is keeping up' }
    return {
        status,
        lossShare: totals.observed === 0 ? 0 : (totals.queueFull / totals.observed) * 100,
        values: {
            throughput: `${formatCount(latest?.persisted ?? 0)}/s`,
            pressure: `${(latest?.pressure ?? 0).toFixed(1)}%`,
            observed: formatCount(totals.observed),
            accepted: formatCount(totals.accepted),
            queueFull: formatCount(totals.queueFull),
            current: `${formatCount(totals.depth)} pkt · ${formatBinaryBytes(totals.depth * PACKET_BYTES)}`,
            persisted: formatCount(totals.persisted),
            diskRetained: formatBinaryBytes(totals.persisted * PACKET_BYTES),
            analyzed: formatCount(totals.analyzed),
            backlog: `${formatCount(totals.backlog)} pkt · ${formatBinaryBytes(totals.backlog * PACKET_BYTES)}`,
            interfaceQueue: `${formatCount(totals.depth)}/${formatCount(QUEUE_CAPACITY)}`,
            interfaceBytes: formatBinaryBytes(totals.depth * PACKET_BYTES),
            interfacePeak: formatCount(totals.peak),
            interfaceLost: formatCount(totals.queueFull),
        },
        conservation: [
            { label: 'Observed', left: totals.observed, right: totals.accepted + totals.queueFull },
            { label: 'Queue', left: totals.accepted, right: totals.persisted + totals.depth },
            { label: 'Analysis', left: totals.persisted, right: totals.analyzed + totals.backlog },
        ],
    }
}

export const CHART_WIDTH = 600
export const CHART_HEIGHT = 180
export const PRESSURE_HEIGHT = 40

function niceStep(value: number) {
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)))
    const normalized = value / magnitude
    return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
}

function line(
    samples: readonly Sample[],
    value: (sample: Sample) => number,
    top: number,
    height: number,
) {
    return samples
        .map((sample, index) => {
            const x = (index / (WINDOW - 1)) * CHART_WIDTH
            const y = height - (Math.min(value(sample), top) / top) * height
            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
        })
        .join('')
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
})

export function chart(simulation: Simulation) {
    const samples = simulation.samples
    const peak = Math.max(...samples.map((sample) => sample.observed))
    const stepSize = niceStep(peak / 3)
    const top = Math.max(stepSize, Math.ceil(peak / stepSize) * stepSize)
    const ticks = Array.from({ length: Math.round(top / stepSize) + 1 }, (_, index) => ({
        label: compact.format(index * stepSize),
        offset: 1 - (index * stepSize) / top,
    }))
    const times = [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const sample = samples[Math.round(fraction * (samples.length - 1))]
        return { label: sample ? clock.format(sample.at) : '', offset: fraction }
    })
    return {
        ticks,
        times,
        lines: {
            observed: line(samples, (sample) => sample.observed, top, CHART_HEIGHT),
            persisted: line(samples, (sample) => sample.persisted, top, CHART_HEIGHT),
            analyzed: line(samples, (sample) => sample.analyzed, top, CHART_HEIGHT),
        },
        pressure: line(samples, (sample) => sample.pressure, 100, PRESSURE_HEIGHT),
    }
}

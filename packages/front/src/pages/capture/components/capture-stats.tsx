import type { CaptureStats } from '@repo/shared/capture'
import { useEffect, useRef, useState } from 'react'

import { formatCount } from '../model/packet-view'
import { PanelShell } from './panel-shell'

export function CaptureStatsPanel({ stats, state }: { stats?: CaptureStats; state?: string }) {
    const previous = useRef<{ at: number; packets: bigint } | undefined>(undefined)
    const [packetRate, setPacketRate] = useState<bigint>()
    useEffect(() => {
        if (!stats) return
        const now = performance.now(),
            packets = BigInt(stats.packetsSeen),
            last = previous.current
        if (last && packets >= last.packets) {
            const elapsed = BigInt(Math.max(1, Math.round(now - last.at)))
            setPacketRate(((packets - last.packets) * 1000n) / elapsed)
        } else setPacketRate(undefined)
        previous.current = { at: now, packets }
    }, [stats])
    if (!stats)
        return (
            <PanelShell title="Statistics">
                <div className="text-muted-foreground grid h-full place-items-center text-xs">
                    {state ? 'Waiting for counters' : 'Capture is idle'}
                </div>
            </PanelShell>
        )
    const losses =
        BigInt(stats.appRingDrops) +
        BigInt(stats.pcapDropped) +
        BigInt(stats.pcapInterfaceDropped) +
        BigInt(stats.retentionRejected) +
        BigInt(stats.ipcDrops)
    const active = state === 'starting' || state === 'running' || state === 'stopping'
    const healthy = losses === 0n && state !== 'failed' && (!active || stats.parserThreadRunning)
    const items = [
        ['Packets seen', formatCount(stats.packetsSeen)],
        ['Packet rate', packetRate === undefined ? '—' : `${formatCount(packetRate)}/s`],
        ['Enqueued', formatCount(stats.packetsEnqueued)],
        ['Parsed', formatCount(stats.packetsParsed)],
        ['Retained', formatCount(stats.retainedPackets)],
        ['Retained bytes', formatCount(stats.retainedBytes)],
        ['App ring drops', formatCount(stats.appRingDrops)],
        ['pcap drops', formatCount(stats.pcapDropped)],
        ['Interface drops', formatCount(stats.pcapInterfaceDropped)],
        ['Retention rejects', formatCount(stats.retentionRejected)],
        ['IPC drops', formatCount(stats.ipcDrops)],
        ['Evictions', formatCount(stats.retentionEvictions)],
        ['Parser thread', stats.parserThreadRunning ? 'running' : 'stopped'],
    ]
    return (
        <PanelShell title="Statistics" meta={healthy ? 'healthy' : 'attention'}>
            <div className="h-full overflow-auto p-3">
                <div
                    className={`mb-3 border-l-2 px-2 py-1 text-xs font-medium ${healthy ? 'border-emerald-500 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400' : 'border-amber-500 bg-amber-500/8 text-amber-700 dark:text-amber-400'}`}
                >
                    {healthy ? 'Capture pipeline healthy' : 'Capture pipeline needs attention'}
                </div>
                <dl className="grid grid-cols-2 gap-x-4">
                    {items.map(([label, value]) => (
                        <div key={label} className="border-b py-2">
                            <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                                {label}
                            </dt>
                            <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>
                {stats.interfaces.map((item) => (
                    <section key={item.interfaceId} className="mt-4 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-xs font-medium">
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
                                <span className="text-foreground font-mono">
                                    {item.ringDepth}/{item.ringCapacity}
                                </span>
                            </div>
                            <div>
                                Peak{' '}
                                <span className="text-foreground font-mono">
                                    {item.maxRingDepth}
                                </span>
                            </div>
                            <div>
                                Parsed{' '}
                                <span className="text-foreground font-mono">
                                    {formatCount(item.packetsParsed)}
                                </span>
                            </div>
                            <div>
                                Drops{' '}
                                <span className="text-foreground font-mono">
                                    {formatCount(item.appRingDrops)}
                                </span>
                            </div>
                        </dl>
                    </section>
                ))}
            </div>
        </PanelShell>
    )
}

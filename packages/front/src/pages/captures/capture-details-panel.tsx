import type { CaptureRecord } from '@repo/shared/capture'
import { Button, MiddleTruncate } from '@repo/ui'
import { cn } from '@repo/utils'
import { Check, Copy, FileOutput, FolderOpen, MousePointerClick } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { copyText } from '#front/pages/capture/model/copy-text'

import { type CaptureActionHandlers, CaptureMoreMenu } from './capture-actions'
import {
    type CaptureHealth,
    captureDurationSeconds,
    captureHealth,
    captureSourceLabel,
    formatDateTime,
    formatDuration,
} from './capture-history'
import { HealthDot, healthText } from './capture-history-list'
import { formatBytes } from './format-bytes'

const healthLabel: Record<CaptureHealth, string> = {
    live: 'Capturing',
    healthy: 'Complete',
    degraded: 'Needs attention',
    failed: 'Failed',
}

export function CaptureDetailsPanel({
    capture,
    handlers,
}: {
    capture: CaptureRecord | undefined
    handlers: CaptureActionHandlers
}) {
    if (!capture) {
        return (
            <aside className="text-muted-foreground grid h-full place-items-center p-6 text-center text-xs">
                <div>
                    <MousePointerClick className="mx-auto mb-2 size-5" />
                    Select a capture to see its details.
                </div>
            </aside>
        )
    }

    const health = captureHealth(capture)
    const { source } = capture

    return (
        <aside
            aria-label="Capture details"
            className="flex h-full min-h-0 flex-col overflow-y-auto"
        >
            <header className="flex flex-col gap-3 border-b p-3">
                <div className="min-w-0">
                    <h2 className="truncate text-sm font-medium">{captureSourceLabel(capture)}</h2>
                    <p
                        className={cn(
                            'mt-0.5 flex items-center gap-1.5 text-xs',
                            healthText(health),
                        )}
                    >
                        <HealthDot health={health} className="size-1.5" />
                        {healthLabel[health]}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => handlers.onOpen(capture)}>
                        <FolderOpen />
                        Open
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handlers.onExport(capture)}>
                        <FileOutput />
                        Export
                    </Button>
                    <CaptureMoreMenu
                        capture={capture}
                        handlers={handlers}
                        exclude={['open', 'export']}
                        className="ml-auto"
                    />
                </div>
            </header>

            {capture.failure ? (
                <Notice tone="failed" title={capture.failure.code}>
                    {capture.failure.message}
                    {capture.failure.recoverable ? ' The capture can be recovered.' : null}
                </Notice>
            ) : null}
            {capture.retainedPortionOnly ? (
                <Notice tone="degraded" title="Retained portion only">
                    Older packets were discarded by the retention limit. Only the most recent
                    segments can be opened or exported.
                </Notice>
            ) : null}

            <Section title="Timing">
                <Field label="Started">{formatDateTime(capture.startedAtNs)}</Field>
                <Field label="Ended">
                    {capture.stoppedAtNs ? formatDateTime(capture.stoppedAtNs) : 'Still running'}
                </Field>
                <Field label="Duration">{formatDuration(captureDurationSeconds(capture))}</Field>
            </Section>

            <Section title="Data">
                <Field label="Packets">{BigInt(capture.packetCount).toLocaleString()}</Field>
                <Field label="Retained">{formatBytes(capture.retainedBytes)}</Field>
                <Field label="Format">{capture.sourceFormat.toUpperCase()}</Field>
            </Section>

            {source._tag === 'Live' ? (
                <Section title="Capture settings">
                    {source.interfaces.map((item) => (
                        <Field key={item.name} label={item.name}>
                            {[
                                item.promiscuous ? 'Promiscuous' : 'Non-promiscuous',
                                item.monitorMode ? 'monitor mode' : null,
                            ]
                                .filter(Boolean)
                                .join(', ')}
                        </Field>
                    ))}
                    <Field label="Filter" mono>
                        {source.bpfFilter || <span className="text-muted-foreground">None</span>}
                    </Field>
                    <Field label="Snapshot">{source.snaplen.toLocaleString()} bytes</Field>
                    <Field label="Storage">
                        {source.spoolRingMode ? 'Ring buffer' : 'Append'}
                        {source.spoolTemporary ? ', temporary' : null}
                    </Field>
                </Section>
            ) : (
                <Section title="Source">
                    <Field label="Origin">Imported file</Field>
                </Section>
            )}

            <Section title="Identifier">
                <CaptureIdField captureId={capture.captureId} />
            </Section>
        </aside>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="border-b px-3 py-2.5 last:border-b-0">
            <h3 className="text-muted-foreground mb-1.5 text-xs font-medium">{title}</h3>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                {children}
            </dl>
        </section>
    )
}

function Field({
    label,
    mono = false,
    children,
}: {
    label: string
    mono?: boolean
    children: ReactNode
}) {
    return (
        <>
            <dt className="text-muted-foreground truncate">{label}</dt>
            <dd className={cn('min-w-0 break-words tabular-nums', mono && 'font-mono')}>
                {children}
            </dd>
        </>
    )
}

function Notice({
    tone,
    title,
    children,
}: {
    tone: 'failed' | 'degraded'
    title: string
    children: ReactNode
}) {
    return (
        <div
            role={tone === 'failed' ? 'alert' : 'status'}
            className={cn(
                'border-b px-3 py-2.5 text-xs',
                tone === 'failed' ? 'bg-destructive/8' : 'bg-amber-500/8',
            )}
        >
            <p className={cn('font-medium', healthText(tone))}>{title}</p>
            <p className="text-muted-foreground mt-0.5">{children}</p>
        </div>
    )
}

function CaptureIdField({ captureId }: { captureId: string }) {
    const [copied, setCopied] = useState(false)

    return (
        <>
            <dt className="text-muted-foreground">Capture ID</dt>
            <dd className="flex min-w-0 items-center gap-1">
                <MiddleTruncate value={captureId} tailLength={8} className="font-mono" />
                <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={copied ? 'Capture ID copied' : 'Copy capture ID'}
                    onClick={() => {
                        void copyText(captureId).then((ok) => {
                            if (!ok) return
                            setCopied(true)
                            window.setTimeout(() => setCopied(false), 1_500)
                        })
                    }}
                >
                    {copied ? <Check /> : <Copy />}
                </Button>
            </dd>
        </>
    )
}

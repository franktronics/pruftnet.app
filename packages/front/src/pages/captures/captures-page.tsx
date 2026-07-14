import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { CaptureRecord } from '@repo/shared/capture'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Badge,
    Button,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@repo/ui'
import { Clock3, FileOutput, FolderOpen, Plus, Radio, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureHistoryOptions, captureKeys } from '#front/pages/capture/api/capture-queries'

import { CaptureExportDialog } from './export-dialog'

function timestamp(value: string | null) {
    if (!value) return '—'
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'medium',
    }).format(new Date(Number(BigInt(value) / 1_000_000n)))
}

function duration(capture: CaptureRecord) {
    const end = capture.stoppedAtNs ? BigInt(capture.stoppedAtNs) : BigInt(Date.now()) * 1_000_000n
    const seconds =
        end > BigInt(capture.startedAtNs)
            ? (end - BigInt(capture.startedAtNs)) / 1_000_000_000n
            : 0n
    const hours = seconds / 3_600n
    const minutes = (seconds % 3_600n) / 60n
    const remainder = seconds % 60n
    return hours > 0n
        ? `${hours.toString()}h ${minutes.toString()}m`
        : `${minutes.toString()}m ${remainder.toString()}s`
}

function bytes(value: string) {
    const amount = BigInt(value)
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
    let scaled = amount
    let unit = 0
    while (scaled >= 1024n && unit < units.length - 1) {
        scaled /= 1024n
        unit += 1
    }
    return `${scaled.toLocaleString()} ${units[unit]}`
}

function StateBadge({ capture }: { readonly capture: CaptureRecord }) {
    if (capture.state === 'capturing' || capture.state === 'stopping') {
        return (
            <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
            >
                <span className="mr-1 size-1.5 rounded-full bg-emerald-500" /> Live
            </Badge>
        )
    }
    return (
        <Badge variant={capture.state === 'failed' ? 'destructive' : 'secondary'}>
            {capture.state}
        </Badge>
    )
}

export function CapturesPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const captures = useQuery(captureHistoryOptions())
    const [exportCapture, setExportCapture] = useState<CaptureRecord>()
    const [deleteCapture, setDeleteCapture] = useState<CaptureRecord>()
    const open = useMutation({
        mutationFn: captureClient.openCapture,
        onSuccess: (result) =>
            navigate({
                to: '/capture/$captureId',
                params: { captureId: result.capture.captureId },
            }),
    })
    const remove = useMutation({
        mutationFn: captureClient.deleteCapture,
        onSuccess: async () => {
            setDeleteCapture(undefined)
            await queryClient.invalidateQueries({ queryKey: captureKeys.history() })
        },
    })

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3 px-4">
                <div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
                        <Clock3 className="size-3.5" /> Retained packet ledger
                    </p>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight">Captures</h1>
                    <p className="text-muted-foreground text-sm">
                        Durable sessions remain available until explicitly deleted.
                    </p>
                </div>
                <Button nativeButton={false} render={<Link to="/" />}>
                    <Plus /> New capture
                </Button>
            </div>

            {captures.error ? (
                <div className="px-4">
                    <BasicErrorAlert
                        error={captures.error}
                        onRetry={() => void captures.refetch()}
                    />
                </div>
            ) : null}
            {open.error || remove.error ? (
                <div className="px-4">
                    <BasicErrorAlert error={open.error ?? remove.error} />
                </div>
            ) : null}

            <div className="bg-background min-h-0 min-w-0 flex-1 overflow-hidden border-y">
                <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-44">Capture</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Ended / duration</TableHead>
                            <TableHead>Interfaces</TableHead>
                            <TableHead className="text-right">Packets</TableHead>
                            <TableHead className="text-right">Retained</TableHead>
                            <TableHead>Format</TableHead>
                            <TableHead>Recovery / failure</TableHead>
                            <TableHead className="text-right">Exports</TableHead>
                            <TableHead className="w-48 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(captures.data?.captures ?? []).map((capture) => (
                            <TableRow
                                key={capture.captureId}
                                className={
                                    capture.state === 'capturing'
                                        ? 'border-l-2 border-l-emerald-500'
                                        : 'border-l-2 border-l-transparent'
                                }
                            >
                                <TableCell>
                                    <button
                                        className="hover:text-primary text-left font-mono text-xs"
                                        title={capture.captureId}
                                        onClick={() => open.mutate(capture.captureId)}
                                    >
                                        {capture.captureId.slice(0, 12)}
                                    </button>
                                </TableCell>
                                <TableCell>
                                    <StateBadge capture={capture} />
                                </TableCell>
                                <TableCell>{timestamp(capture.startedAtNs)}</TableCell>
                                <TableCell>
                                    <div>{timestamp(capture.stoppedAtNs)}</div>
                                    <div className="text-muted-foreground font-mono">
                                        {duration(capture)}
                                    </div>
                                </TableCell>
                                <TableCell
                                    className="max-w-52 truncate"
                                    title={capture.interfaceNames.join(', ')}
                                >
                                    {capture.interfaceNames.join(', ')}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {BigInt(capture.packetCount).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {bytes(capture.retainedBytes)}
                                </TableCell>
                                <TableCell className="uppercase">{capture.sourceFormat}</TableCell>
                                <TableCell className="max-w-64">
                                    {capture.failure ? (
                                        <span
                                            className="text-destructive block truncate"
                                            title={capture.failure.message}
                                        >
                                            {capture.failure.code}: {capture.failure.message}
                                        </span>
                                    ) : capture.retainedPortionOnly ? (
                                        <span className="text-amber-600 dark:text-amber-400">
                                            Retained portion only
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">Healthy</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {capture.exportCount}
                                </TableCell>
                                <TableCell>
                                    <div className="flex justify-end gap-1">
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            aria-label="Open capture"
                                            onClick={() => open.mutate(capture.captureId)}
                                        >
                                            <FolderOpen />
                                        </Button>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            aria-label="Export capture"
                                            onClick={() => setExportCapture(capture)}
                                        >
                                            <FileOutput />
                                        </Button>
                                        <Button
                                            size="icon-sm"
                                            variant="ghost"
                                            aria-label="Delete capture"
                                            disabled={
                                                capture.state === 'capturing' ||
                                                capture.state === 'stopping'
                                            }
                                            onClick={() => setDeleteCapture(capture)}
                                        >
                                            <Trash2 />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                {!captures.isPending && captures.data?.captures.length === 0 ? (
                    <div className="grid min-h-64 place-items-center p-8 text-center">
                        <div>
                            <Radio className="text-muted-foreground mx-auto mb-3 size-6" />
                            <p className="text-sm font-medium">No retained captures</p>
                            <p className="text-muted-foreground mt-1 text-xs">
                                Start a capture to create the first durable session.
                            </p>
                        </div>
                    </div>
                ) : null}
            </div>

            {exportCapture ? (
                <CaptureExportDialog
                    capture={exportCapture}
                    open
                    onOpenChange={(next) => !next && setExportCapture(undefined)}
                />
            ) : null}
            <AlertDialog
                open={Boolean(deleteCapture)}
                onOpenChange={(next) => !next && setDeleteCapture(undefined)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete retained capture?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Packet segments and stored analysis will be removed. If an export still
                            reads this capture, deletion remains deferred until its final lease is
                            released.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={remove.isPending}
                            onClick={() => deleteCapture && remove.mutate(deleteCapture.captureId)}
                        >
                            Delete capture
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    )
}

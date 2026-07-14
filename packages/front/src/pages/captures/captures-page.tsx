import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
    Input,
    NativeSelect,
    NativeSelectOption,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@repo/ui'
import { Clock3, FileOutput, FolderOpen, Radio, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

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
    const [search, setSearch] = useState('')
    const [state, setState] = useState('all')
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
    const visibleCaptures = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase()
        return (captures.data?.captures ?? []).filter((capture) => {
            const stateMatches =
                state === 'all' ||
                (state === 'live'
                    ? capture.state === 'capturing' || capture.state === 'stopping'
                    : capture.state === state)
            if (!stateMatches) return false
            if (!needle) return true
            return [
                capture.captureId,
                capture.state,
                capture.sourceFormat,
                ...capture.interfaceNames,
                capture.failure?.code,
                capture.failure?.message,
            ].some((value) => value?.toLocaleLowerCase().includes(needle))
        })
    }, [captures.data?.captures, search, state])

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 py-4">
            <div className="px-4">
                <div>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
                        <Clock3 className="size-3.5" /> Retained packet ledger
                    </p>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight">Capture history</h1>
                    <p className="text-muted-foreground text-sm">
                        Durable sessions remain available until explicitly deleted.
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 px-4" aria-label="History filters">
                <label className="relative min-w-56 flex-1 sm:max-w-sm">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Filter by capture, interface, or failure"
                        className="pl-8"
                    />
                    <span className="sr-only">Filter capture history</span>
                </label>
                <NativeSelect
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    aria-label="Filter by state"
                    className="w-36"
                >
                    <NativeSelectOption value="all">All states</NativeSelectOption>
                    <NativeSelectOption value="live">Live</NativeSelectOption>
                    <NativeSelectOption value="stopped">Stopped</NativeSelectOption>
                    <NativeSelectOption value="completed">Completed</NativeSelectOption>
                    <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {visibleCaptures.length} of {captures.data?.captures.length ?? 0}
                </span>
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

            <div className="bg-background mx-4 min-h-0 min-w-0 flex-1 overflow-auto border-t">
                <Table>
                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-44">Capture</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Ended / duration</TableHead>
                            <TableHead>Interfaces</TableHead>
                            <TableHead className="text-right">Packets</TableHead>
                            <TableHead className="hidden text-right xl:table-cell">Retained</TableHead>
                            <TableHead className="hidden xl:table-cell">Format</TableHead>
                            <TableHead className="hidden 2xl:table-cell">Recovery / failure</TableHead>
                            <TableHead className="hidden text-right 2xl:table-cell">Exports</TableHead>
                            <TableHead className="w-32 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleCaptures.map((capture) => (
                            <TableRow
                                key={capture.captureId}
                                tabIndex={0}
                                aria-label={`Open capture ${capture.captureId}`}
                                onClick={() => open.mutate(capture.captureId)}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return
                                    event.preventDefault()
                                    open.mutate(capture.captureId)
                                }}
                                className={`cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none ${
                                    capture.state === 'capturing'
                                        ? 'shadow-[inset_3px_0_0_var(--color-emerald-500)]'
                                        : ''
                                }`}
                            >
                                <TableCell>
                                    <span className="font-mono text-xs" title={capture.captureId}>
                                        {capture.captureId.slice(0, 12)}
                                    </span>
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
                                <TableCell className="hidden text-right font-mono xl:table-cell">
                                    {bytes(capture.retainedBytes)}
                                </TableCell>
                                <TableCell className="hidden uppercase xl:table-cell">
                                    {capture.sourceFormat}
                                </TableCell>
                                <TableCell className="hidden max-w-64 2xl:table-cell">
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
                                <TableCell className="hidden text-right font-mono 2xl:table-cell">
                                    {capture.exportCount}
                                </TableCell>
                                <TableCell>
                                    <div
                                        className="flex justify-end gap-1"
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={(event) => event.stopPropagation()}
                                    >
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
                {!captures.isPending &&
                captures.data?.captures.length !== 0 &&
                visibleCaptures.length === 0 ? (
                    <div className="grid min-h-48 place-items-center p-8 text-center">
                        <div>
                            <Search className="text-muted-foreground mx-auto mb-3 size-6" />
                            <p className="text-sm font-medium">No captures match these filters</p>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="mt-2"
                                onClick={() => {
                                    setSearch('')
                                    setState('all')
                                }}
                            >
                                Clear filters
                            </Button>
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

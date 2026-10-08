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
    NativeSelect,
    NativeSelectOption,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@repo/ui'
import { FileOutput, FolderOpen, Radio, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { ToolbarSearch } from '#front/components/toolbar-search'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureHistoryOptions, captureKeys } from '#front/pages/capture/api/capture-queries'

import { useExportManager } from './export-manager'
import { formatBytes } from './format-bytes'

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
    const { openExportManager } = useExportManager()
    const captures = useQuery(captureHistoryOptions())
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
    const totalCaptures = captures.data?.captures.length ?? 0

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ToolbarSearch
                value={search}
                onChange={setSearch}
                label="Capture history filter"
                placeholder="Filter by capture, interface, or failure..."
                count={
                    search.trim() || state !== 'all'
                        ? `${visibleCaptures.length.toLocaleString()} / ${totalCaptures.toLocaleString()}`
                        : totalCaptures.toLocaleString()
                }
            >
                <NativeSelect
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    aria-label="Filter by state"
                    className="w-32"
                >
                    <NativeSelectOption value="all">All states</NativeSelectOption>
                    <NativeSelectOption value="live">Live</NativeSelectOption>
                    <NativeSelectOption value="stopped">Stopped</NativeSelectOption>
                    <NativeSelectOption value="completed">Completed</NativeSelectOption>
                    <NativeSelectOption value="failed">Failed</NativeSelectOption>
                </NativeSelect>
            </ToolbarSearch>

            {captures.error ? (
                <div className="shrink-0 border-b p-3">
                    <BasicErrorAlert
                        error={captures.error}
                        onRetry={() => void captures.refetch()}
                    />
                </div>
            ) : null}
            {open.error || remove.error ? (
                <div className="shrink-0 border-b p-3">
                    <BasicErrorAlert error={open.error ?? remove.error} />
                </div>
            ) : null}

            <div className="bg-background min-h-0 min-w-0 flex-1 overflow-auto">
                {/* The page scroller owns both axes so the sticky header anchors to it. */}
                <Table containerClassName="overflow-visible">
                    <TableHeader className="sticky top-0 z-10">
                        <TableRow>
                            <TableHead className="w-12">No.</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Started</TableHead>
                            <TableHead>Ended</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>Interfaces</TableHead>
                            <TableHead className="text-right">Packets</TableHead>
                            <TableHead className="hidden text-right xl:table-cell">
                                Retained
                            </TableHead>
                            <TableHead className="hidden xl:table-cell">Format</TableHead>
                            <TableHead className="hidden 2xl:table-cell">
                                Recovery / failure
                            </TableHead>
                            <TableHead className="w-32 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {visibleCaptures.map((capture, index) => (
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
                                className={`focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset ${
                                    capture.state === 'capturing'
                                        ? 'shadow-[inset_3px_0_0_var(--color-emerald-500)]'
                                        : ''
                                }`}
                            >
                                <TableCell
                                    className="text-muted-foreground font-mono tabular-nums"
                                    title={capture.captureId}
                                >
                                    {index + 1}
                                </TableCell>
                                <TableCell>
                                    <StateBadge capture={capture} />
                                </TableCell>
                                <TableCell className="font-mono tabular-nums">
                                    {timestamp(capture.startedAtNs)}
                                </TableCell>
                                <TableCell className="font-mono tabular-nums">
                                    {timestamp(capture.stoppedAtNs)}
                                </TableCell>
                                <TableCell className="text-muted-foreground font-mono tabular-nums">
                                    {duration(capture)}
                                </TableCell>
                                <TableCell
                                    className="max-w-52 truncate"
                                    title={capture.interfaceNames.join(', ')}
                                >
                                    {capture.interfaceNames.join(', ')}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                    {BigInt(capture.packetCount).toLocaleString()}
                                </TableCell>
                                <TableCell className="hidden text-right font-mono tabular-nums xl:table-cell">
                                    {formatBytes(capture.retainedBytes)}
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
                                            onClick={() => openExportManager(capture)}
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

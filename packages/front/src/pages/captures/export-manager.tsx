import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    ExportJobList,
    type CaptureRecord,
    type ExportFormat,
    type ExportJob,
} from '@repo/shared/capture'
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Label,
    NativeSelect,
    NativeSelectOption,
    Progress,
    ProgressLabel,
} from '@repo/ui'
import {
    AlertCircle,
    CheckCircle2,
    Download,
    FileOutput,
    FolderOpen,
    LoaderCircle,
} from 'lucide-react'
import { createContext, use, useMemo, useState, type ReactNode } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { getRpcEndpoint } from '#front/config/rpc-client'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys, exportJobsOptions } from '#front/pages/capture/api/capture-queries'

import {
    aggregateExportProgressPercent,
    exportProgressLabel,
    exportProgressPercent,
} from './export-progress'
import { formatBytes } from './format-bytes'

interface ExportManagerValue {
    readonly activeExports: ReadonlyArray<ExportJob>
    readonly aggregatePercent: number | null
    readonly openExportManager: (capture?: CaptureRecord) => void
}

const ExportManagerContext = createContext<ExportManagerValue | undefined>(undefined)

function downloadUrl(path: string) {
    const rpc = getRpcEndpoint()
    const url = new URL(path, rpc)
    if (rpc.search) url.search = rpc.search
    return url.toString()
}

function captureTimestamp(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(Number(BigInt(value) / 1_000_000n)))
}

function destinationName(path: string) {
    return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function ExportJobCard({ job }: { readonly job: ExportJob }) {
    const percent = exportProgressPercent(job)
    return (
        <div className="border-border bg-muted/15 grid gap-2 rounded-lg border p-3">
            <div className="flex min-w-0 items-start gap-2.5">
                <LoaderCircle className="text-primary mt-0.5 size-4 shrink-0 animate-spin" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={job.destinationLabel}>
                        {destinationName(job.destinationLabel)}
                    </p>
                    <p
                        className="text-muted-foreground truncate text-xs"
                        title={job.destinationLabel}
                    >
                        {job.destinationLabel}
                    </p>
                </div>
                <Badge variant="outline">{exportProgressLabel(job)}</Badge>
            </div>
            <Progress value={percent}>
                <ProgressLabel>
                    {job.format.toUpperCase()} · {captureTimestamp(job.captureStartedAtNs)}
                </ProgressLabel>
                <span className="text-muted-foreground ml-auto text-xs/relaxed tabular-nums">
                    {percent === null ? 'Working' : `${percent}%`}
                </span>
            </Progress>
            <p className="text-muted-foreground text-xs tabular-nums">
                {BigInt(job.packetsWritten).toLocaleString()} /{' '}
                {BigInt(job.packetsTotal).toLocaleString()} packets ·{' '}
                {formatBytes(job.bytesWritten)} written
            </p>
        </div>
    )
}

function RecentExportCard({ job }: { readonly job: ExportJob }) {
    const completed = job.state === 'completed'
    return (
        <div className="border-border flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5">
            {completed ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
                <AlertCircle className="text-destructive size-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={job.destinationLabel}>
                    {completed ? 'Export completed' : job.failure?.title}
                </p>
                <p className="text-muted-foreground truncate text-xs" title={job.destinationLabel}>
                    {destinationName(job.destinationLabel)} · {job.format.toUpperCase()}
                    {completed && job.finalSize ? ` · ${formatBytes(job.finalSize)}` : ''}
                </p>
                {!completed && job.failure ? (
                    <p className="text-destructive mt-1 text-xs">{job.failure.message}</p>
                ) : null}
            </div>
            {completed && job.downloadPath ? (
                <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={<a href={downloadUrl(job.downloadPath)} />}
                >
                    <Download /> Download
                </Button>
            ) : null}
        </div>
    )
}

export function ExportManagerProvider({ children }: { readonly children: ReactNode }) {
    const queryClient = useQueryClient()
    const jobs = useQuery(exportJobsOptions())
    const [open, setOpen] = useState(false)
    const [capture, setCapture] = useState<CaptureRecord>()
    const [format, setFormat] = useState<ExportFormat>('pcapng')
    const [destination, setDestination] = useState<DesktopExportDestinationSelection>()
    const [selectingDestination, setSelectingDestination] = useState(false)
    const [destinationError, setDestinationError] = useState<unknown>()
    const desktop = typeof window !== 'undefined' && Boolean(window.pruftnet)
    const activeExports = useMemo(
        () => jobs.data?.exports.filter((job) => job.state === 'running') ?? [],
        [jobs.data?.exports],
    )
    const recentExports = useMemo(
        () => jobs.data?.exports.filter((job) => job.state !== 'running') ?? [],
        [jobs.data?.exports],
    )
    const aggregatePercent = aggregateExportProgressPercent(activeExports)
    const create = useMutation({
        mutationFn: captureClient.createExport,
        onSuccess: (job) => {
            queryClient.setQueryData<ExportJobList>(captureKeys.exportJobs(), (current) => {
                const existing = current?.exports.filter(
                    (candidate) => candidate.exportId !== job.exportId,
                )
                return new ExportJobList({ exports: [job, ...(existing ?? [])] })
            })
            setDestination(undefined)
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: captureKeys.exportJobs() })
        },
    })

    const openExportManager = (nextCapture?: CaptureRecord) => {
        if (nextCapture?.captureId !== capture?.captureId) {
            setCapture(nextCapture)
            setFormat('pcapng')
            setDestination(undefined)
            setDestinationError(undefined)
            create.reset()
        }
        setOpen(true)
    }

    const selectDestination = async () => {
        if (!window.pruftnet) return
        setSelectingDestination(true)
        setDestinationError(undefined)
        try {
            const selected = await window.pruftnet.selectExportDestination(format)
            if (selected) setDestination(selected)
        } catch (error) {
            setDestinationError(error)
        } finally {
            setSelectingDestination(false)
        }
    }

    const startExport = () => {
        if (!capture || (desktop && !destination)) return
        create.mutate({
            captureId: capture.captureId,
            format,
            destinationLabel: destination?.path ?? `Server ${format.toUpperCase()} download`,
            destinationToken: destination?.destinationToken,
        })
    }

    const context: ExportManagerValue = {
        activeExports,
        aggregatePercent,
        openExportManager,
    }
    const multiInterface = (capture?.interfaceNames.length ?? 0) > 1

    return (
        <ExportManagerContext value={context}>
            {children}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-xl">
                    <DialogHeader className="border-b px-5 pt-5 pb-4">
                        <DialogTitle>Exports</DialogTitle>
                        <DialogDescription>
                            Track background exports and prepare another destination without
                            interrupting current work.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
                        <span className="sr-only" aria-live="polite">
                            {activeExports.length === 0
                                ? 'No exports are currently running.'
                                : `${activeExports.length} export${activeExports.length === 1 ? '' : 's'} currently running.`}
                        </span>
                        {jobs.error ? (
                            <BasicErrorAlert
                                error={jobs.error}
                                onRetry={() => void jobs.refetch()}
                            />
                        ) : null}

                        {activeExports.length > 0 ? (
                            <section className="grid gap-2" aria-labelledby="active-exports-title">
                                <div className="flex items-center gap-2">
                                    <h2 id="active-exports-title" className="text-sm font-medium">
                                        Active exports
                                    </h2>
                                    <Badge variant="secondary">{activeExports.length}</Badge>
                                    <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                                        {aggregatePercent === null
                                            ? 'Calculating…'
                                            : `${aggregatePercent}% overall`}
                                    </span>
                                </div>
                                {activeExports.map((job) => (
                                    <ExportJobCard key={job.exportId} job={job} />
                                ))}
                            </section>
                        ) : null}

                        {capture ? (
                            <section
                                className="grid gap-3"
                                aria-labelledby="new-export-title"
                            >
                                <div>
                                    <h2 id="new-export-title" className="text-sm font-medium">
                                        New export
                                    </h2>
                                    <p className="text-muted-foreground text-xs">
                                        Capture from {captureTimestamp(capture.startedAtNs)}
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="capture-export-format">Format</Label>
                                    <NativeSelect
                                        id="capture-export-format"
                                        value={format}
                                        disabled={create.isPending || selectingDestination}
                                        onChange={(event) => {
                                            setFormat(event.target.value as ExportFormat)
                                            setDestination(undefined)
                                            setDestinationError(undefined)
                                            create.reset()
                                        }}
                                    >
                                        <NativeSelectOption value="pcapng">
                                            pcapng — recommended
                                        </NativeSelectOption>
                                        <NativeSelectOption value="pcap" disabled={multiInterface}>
                                            pcap — single interface only
                                        </NativeSelectOption>
                                    </NativeSelect>
                                    {multiInterface ? (
                                        <p className="text-muted-foreground text-xs">
                                            Classic pcap is unavailable because this capture
                                            contains multiple interfaces.
                                        </p>
                                    ) : null}
                                </div>

                                {desktop ? (
                                    <div className="grid gap-2">
                                        <Label>Destination</Label>
                                        <Button
                                            variant="outline"
                                            className="justify-start"
                                            onClick={() => void selectDestination()}
                                            disabled={selectingDestination || create.isPending}
                                        >
                                            <FolderOpen />
                                            {selectingDestination
                                                ? 'Choosing destination…'
                                                : destination
                                                  ? 'Change destination'
                                                  : 'Choose destination'}
                                        </Button>
                                    </div>
                                ) : null}

                                {destinationError ? (
                                    <BasicErrorAlert error={destinationError} />
                                ) : null}
                                {create.error ? <BasicErrorAlert error={create.error} /> : null}

                                {destination || !desktop ? (
                                    <div className="border-border bg-muted/20 grid gap-2 rounded-lg border p-3">
                                        <div className="flex min-w-0 items-start gap-2.5">
                                            <FileOutput className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className="truncate text-sm font-medium"
                                                    title={destination?.path}
                                                >
                                                    {destination
                                                        ? destinationName(destination.path)
                                                        : `Server ${format.toUpperCase()} download`}
                                                </p>
                                                <p
                                                    className="text-muted-foreground truncate text-xs"
                                                    title={destination?.path}
                                                >
                                                    {destination?.path ??
                                                        'Prepared on the server, then downloaded'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-muted-foreground grid grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <span className="block">Format</span>
                                                <strong className="text-foreground font-medium uppercase">
                                                    {format}
                                                </strong>
                                            </div>
                                            <div>
                                                <span className="block">Estimated size</span>
                                                <strong
                                                    className="text-foreground font-medium"
                                                    title="Based on retained capture data. The encoded file size may differ."
                                                >
                                                    ≈ {formatBytes(capture.retainedBytes)}
                                                </strong>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </section>
                        ) : activeExports.length === 0 && recentExports.length === 0 ? (
                            <div className="text-muted-foreground py-8 text-center text-sm">
                                Open a capture to prepare an export.
                            </div>
                        ) : null}

                        {recentExports.length > 0 ? (
                            <section
                                className="border-border grid gap-2 border-t pt-4"
                                aria-labelledby="recent-exports-title"
                            >
                                <h2 id="recent-exports-title" className="text-sm font-medium">
                                    Recent exports
                                </h2>
                                {recentExports.map((job) => (
                                    <RecentExportCard key={job.exportId} job={job} />
                                ))}
                            </section>
                        ) : null}
                    </div>

                    <DialogFooter className="border-t px-5 py-4">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Close
                        </Button>
                        {capture ? (
                            <Button
                                onClick={startExport}
                                disabled={
                                    create.isPending ||
                                    selectingDestination ||
                                    (desktop && !destination)
                                }
                            >
                                {create.isPending ? (
                                    <LoaderCircle className="animate-spin" />
                                ) : (
                                    <FileOutput />
                                )}
                                {create.isPending ? 'Starting…' : 'Start export'}
                            </Button>
                        ) : null}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ExportManagerContext>
    )
}

export function useExportManager() {
    const context = use(ExportManagerContext)
    if (!context) throw new Error('useExportManager must be used within ExportManagerProvider')
    return context
}

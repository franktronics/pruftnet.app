import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CaptureRecord, ExportFormat } from '@repo/shared/capture'
import {
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
} from '@repo/ui'
import { Download, FileOutput, X } from 'lucide-react'
import { useState } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { getRpcEndpoint } from '#front/config/rpc-client'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys, exportListOptions } from '#front/pages/capture/api/capture-queries'

function downloadUrl(path: string) {
    const rpc = getRpcEndpoint()
    const url = new URL(path, rpc)
    if (rpc.search) url.search = rpc.search
    return url.toString()
}

export function CaptureExportDialog({
    capture,
    open,
    onOpenChange,
}: {
    readonly capture: CaptureRecord
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
}) {
    const queryClient = useQueryClient()
    const [format, setFormat] = useState<ExportFormat>('pcapng')
    const desktop = typeof window !== 'undefined' && Boolean(window.pruftnet)
    const exports = useQuery({ ...exportListOptions(capture.captureId), enabled: open })
    const create = useMutation({
        mutationFn: async () => {
            const destinationToken = desktop
                ? await window.pruftnet?.selectExportDestination(format)
                : undefined
            if (desktop && !destinationToken) return undefined
            return captureClient.createExport({
                captureId: capture.captureId,
                format,
                destinationToken: destinationToken ?? undefined,
                idempotencyKey: crypto.randomUUID(),
            })
        },
        onSuccess: async (job) => {
            if (!job) return
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: captureKeys.exports(capture.captureId) }),
                queryClient.invalidateQueries({ queryKey: captureKeys.history() }),
            ])
        },
    })
    const cancel = useMutation({
        mutationFn: captureClient.cancelExport,
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: captureKeys.exports(capture.captureId) }),
    })
    const multiInterface = capture.interfaceNames.length > 1

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Export capture</DialogTitle>
                    <DialogDescription>
                        Export a fixed snapshot of currently committed packets. Later packets are
                        not added to this job.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="capture-export-format">Format</Label>
                    <NativeSelect
                        id="capture-export-format"
                        value={format}
                        onChange={(event) => setFormat(event.target.value as ExportFormat)}
                    >
                        <NativeSelectOption value="pcapng">pcapng — recommended</NativeSelectOption>
                        <NativeSelectOption value="pcap" disabled={multiInterface}>
                            pcap — single interface only
                        </NativeSelectOption>
                    </NativeSelect>
                    {multiInterface ? (
                        <p className="text-muted-foreground text-xs">
                            Classic pcap is disabled because this capture contains multiple
                            interfaces.
                        </p>
                    ) : null}
                </div>
                {create.error ? <BasicErrorAlert error={create.error} /> : null}
                <div className="max-h-56 space-y-2 overflow-y-auto border-t pt-3">
                    {(exports.data?.exports ?? []).map((job) => {
                        const total = BigInt(job.packetsTotal)
                        const written = BigInt(job.packetsWritten)
                        const percent = total === 0n ? 0 : Number((written * 100n) / total)
                        const active = ['queued', 'preparing', 'running', 'finalizing'].includes(
                            job.state,
                        )
                        const cancellable = active || job.state === 'interrupted'
                        return (
                            <div
                                key={job.exportId}
                                className="bg-muted/25 grid gap-2 rounded-md p-2"
                            >
                                <div className="flex items-center gap-2 text-xs">
                                    <FileOutput className="size-3.5" />
                                    <span className="font-mono">{job.exportId.slice(0, 10)}</span>
                                    <span className="text-muted-foreground uppercase">
                                        {job.format} · {job.state}
                                    </span>
                                    <div className="ml-auto flex items-center gap-1">
                                        {job.downloadPath ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                nativeButton={false}
                                                render={<a href={downloadUrl(job.downloadPath)} />}
                                            >
                                                <Download /> Download
                                            </Button>
                                        ) : null}
                                        {cancellable ? (
                                            <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                aria-label="Cancel export"
                                                onClick={() => cancel.mutate(job.exportId)}
                                            >
                                                <X />
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                                {active ? <Progress value={percent} /> : null}
                                {job.failure ? (
                                    <p className="text-destructive text-xs">
                                        {job.failure.message}
                                    </p>
                                ) : null}
                            </div>
                        )
                    })}
                    {exports.data?.exports.length === 0 ? (
                        <p className="text-muted-foreground py-3 text-center text-xs">
                            No exports for this capture.
                        </p>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                        <FileOutput />
                        {create.isPending
                            ? 'Preparing...'
                            : desktop
                              ? 'Choose destination'
                              : 'Create export'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

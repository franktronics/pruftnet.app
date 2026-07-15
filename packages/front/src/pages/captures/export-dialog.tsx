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
    ProgressLabel,
} from '@repo/ui'
import { CheckCircle2, Download, FileOutput } from 'lucide-react'
import { useState } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { getRpcEndpoint } from '#front/config/rpc-client'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureKeys, exportProgressOptions } from '#front/pages/capture/api/capture-queries'

import { exportProgressLabel, exportProgressPercent } from './export-progress'

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
    const progress = useQuery({
        ...exportProgressOptions(capture.captureId),
        enabled: open,
    })
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
            })
        },
        onMutate: () => {
            void queryClient.invalidateQueries({
                queryKey: captureKeys.exportProgress(capture.captureId),
            })
        },
        onSettled: () => {
            void queryClient.invalidateQueries({
                queryKey: captureKeys.exportProgress(capture.captureId),
            })
        },
    })
    const multiInterface = capture.interfaceNames.length > 1
    const result = create.data
    const percent = exportProgressPercent(progress.data)

    const changeOpen = (next: boolean) => {
        if (!next) create.reset()
        onOpenChange(next)
    }

    return (
        <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Export capture</DialogTitle>
                    <DialogDescription>
                        Prepare the currently committed packets. An unchanged prepared file is
                        reused automatically.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-2">
                    <Label htmlFor="capture-export-format">Format</Label>
                    <NativeSelect
                        id="capture-export-format"
                        value={format}
                        disabled={create.isPending}
                        onChange={(event) => {
                            setFormat(event.target.value as ExportFormat)
                            create.reset()
                        }}
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
                {create.isPending ? (
                    <div className="border-border bg-muted/20 grid gap-2 border-l-2 px-3 py-2.5">
                        <Progress value={percent}>
                            <ProgressLabel>{exportProgressLabel(progress.data)}</ProgressLabel>
                            <span className="text-muted-foreground ml-auto text-xs/relaxed tabular-nums">
                                {percent === null ? 'Working' : `${percent}%`}
                            </span>
                        </Progress>
                        <p className="text-muted-foreground text-xs tabular-nums">
                            {progress.data
                                ? `${BigInt(progress.data.packetsWritten).toLocaleString()} / ${BigInt(progress.data.packetsTotal).toLocaleString()} packets · ${BigInt(progress.data.bytesWritten).toLocaleString()} bytes written`
                                : 'Allocating the export snapshot…'}
                        </p>
                    </div>
                ) : null}
                {result ? (
                    <div className="border-border bg-muted/25 flex items-center gap-3 border-l-2 px-3 py-2.5">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                                {desktop ? 'Export saved' : 'Download ready'}
                            </p>
                            <p className="text-muted-foreground text-xs uppercase">
                                {result.format} · {BigInt(result.finalSize).toLocaleString()} bytes
                            </p>
                        </div>
                        {result.downloadPath ? (
                            <Button
                                size="sm"
                                variant="outline"
                                nativeButton={false}
                                render={<a href={downloadUrl(result.downloadPath)} />}
                            >
                                <Download /> Download
                            </Button>
                        ) : null}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => changeOpen(false)}>
                        Close
                    </Button>
                    <Button onClick={() => create.mutate()} disabled={create.isPending}>
                        <FileOutput />
                        {create.isPending
                            ? 'Preparing…'
                            : desktop
                              ? 'Choose destination'
                              : 'Prepare download'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

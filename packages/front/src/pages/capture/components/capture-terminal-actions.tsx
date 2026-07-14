import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { CaptureSession } from '@repo/shared/capture'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    Button,
} from '@repo/ui'
import { FileOutput, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { CaptureExportDialog } from '#front/pages/captures/export-dialog'

export function CaptureTerminalActions({ session }: { readonly session: CaptureSession }) {
    const navigate = useNavigate()
    const [exportOpen, setExportOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const capture = useQuery({
        queryKey: ['capture', session.captureId, 'record'],
        queryFn: () => captureClient.openCapture(session.captureId),
        enabled: exportOpen,
    })
    const remove = useMutation({
        mutationFn: () => captureClient.deleteCapture(session.captureId),
        onSuccess: () => navigate({ to: '/captures' }),
    })

    return (
        <>
            <div className="bg-background flex h-10 shrink-0 items-center gap-2 border-b px-3">
                <span className="text-muted-foreground mr-auto text-xs">
                    Capture stopped · retained until deleted
                </span>
                <Button size="sm" variant="outline" onClick={() => navigate({ to: '/' })}>
                    <Plus /> New capture
                </Button>
                <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
                    <FileOutput /> Export
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 /> Delete
                </Button>
            </div>
            {capture.data ? (
                <CaptureExportDialog
                    capture={capture.data.capture}
                    open={exportOpen}
                    onOpenChange={setExportOpen}
                />
            ) : null}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete retained capture?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Packet data and stored analysis will be permanently removed. Active
                            export leases defer physical deletion until they finish.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Stay</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate()}
                        >
                            Delete capture
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

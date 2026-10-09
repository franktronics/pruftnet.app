import type { CaptureStorageUsage } from '@repo/shared/capture'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { Button, Input, Spinner } from '@repo/ui/atoms'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@repo/ui/molecules'

import { captureClient } from '#front/pages/capture/api/capture-client'
import {
    activeCaptureOptions,
    captureKeys,
    captureStorageUsageOptions,
} from '#front/pages/capture/api/capture-queries'
import { formatBytes } from '#front/pages/captures/format-bytes'
import { SettingRow, SettingsGroup } from './settings-layout'

const CONFIRMATION_WORD = 'delete'

function totalBytes(usage: CaptureStorageUsage) {
    return BigInt(usage.databaseBytes) + BigInt(usage.captureBytes) + BigInt(usage.exportBytes)
}

function captureCountLabel(count: string) {
    return count === '1' ? '1 capture' : `${BigInt(count).toLocaleString()} captures`
}

function errorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'title' in error) {
        const { title, message } = error as { title: string; message?: string }
        return message ?? title
    }
    return 'Capture data could not be deleted.'
}

function StorageUsageRow({ usage }: { usage: CaptureStorageUsage | undefined }) {
    return (
        <SettingRow
            label="Disk usage"
            description={
                usage ? (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                        <span>Packet files {formatBytes(usage.captureBytes)}</span>
                        <span>Analysis {formatBytes(usage.databaseBytes)}</span>
                        <span>Export cache {formatBytes(usage.exportBytes)}</span>
                    </span>
                ) : (
                    'Measuring stored capture data…'
                )
            }
            control={
                usage ? (
                    <span className="font-mono text-xs tabular-nums">
                        {captureCountLabel(usage.captureCount)} · {formatBytes(totalBytes(usage))}
                    </span>
                ) : (
                    <Spinner />
                )
            }
        />
    )
}

function DeleteAllDataDialog({
    open,
    onOpenChange,
    usage,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    usage: CaptureStorageUsage
}) {
    const queryClient = useQueryClient()
    const confirmationId = useId()
    const [confirmation, setConfirmation] = useState('')
    const active = useQuery(activeCaptureOptions())
    const running = Boolean(active.data)
    const reset = useMutation({
        mutationFn: captureClient.resetStorage,
        onSuccess: (result) => {
            queryClient.setQueryData(captureKeys.storageUsage(), result.usage)
            close()
        },
    })
    const confirmed = confirmation.trim().toLowerCase() === CONFIRMATION_WORD

    function close() {
        setConfirmation('')
        reset.reset()
        onOpenChange(false)
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (reset.isPending) return
                if (next) onOpenChange(true)
                else close()
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete all capture data?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {captureCountLabel(usage.captureCount)} and {formatBytes(totalBytes(usage))}{' '}
                        of packet files, analysis, and cached exports will be permanently deleted.
                        Files you exported to another location are kept.
                    </AlertDialogDescription>
                    {running ? (
                        <p className="text-xs/relaxed font-medium">
                            A capture is running. It will be stopped before its data is deleted.
                        </p>
                    ) : null}
                </AlertDialogHeader>
                <form
                    id={`${confirmationId}-form`}
                    className="grid gap-1.5"
                    onSubmit={(event) => {
                        event.preventDefault()
                        if (confirmed && !reset.isPending) reset.mutate(running)
                    }}
                >
                    <label htmlFor={confirmationId} className="text-xs">
                        Type <span className="font-mono font-medium">{CONFIRMATION_WORD}</span> to
                        confirm
                    </label>
                    <Input
                        id={confirmationId}
                        autoComplete="off"
                        spellCheck={false}
                        value={confirmation}
                        disabled={reset.isPending}
                        onChange={(event) => setConfirmation(event.target.value)}
                    />
                    {reset.isError ? (
                        <p role="alert" className="text-destructive text-xs/relaxed">
                            {errorMessage(reset.error)}
                        </p>
                    ) : null}
                </form>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={reset.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        type="submit"
                        form={`${confirmationId}-form`}
                        variant="destructive"
                        disabled={!confirmed || reset.isPending}
                    >
                        {reset.isPending ? <Spinner /> : null}
                        {running ? 'Stop and delete' : 'Delete all data'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export function StorageSettings() {
    const usage = useQuery(captureStorageUsageOptions())
    const [deleteOpen, setDeleteOpen] = useState(false)
    const empty = usage.data?.captureCount === '0'

    return (
        <>
            <SettingsGroup title="Capture storage">
                <StorageUsageRow usage={usage.data} />
            </SettingsGroup>

            <SettingsGroup title="Delete data">
                <SettingRow
                    label="Delete all capture data"
                    description="Permanently remove every retained capture with its analysis and cached exports. Application settings are not affected."
                    control={
                        <Button
                            variant="destructive"
                            disabled={!usage.data || empty}
                            onClick={() => setDeleteOpen(true)}
                        >
                            Delete all data
                        </Button>
                    }
                />
            </SettingsGroup>
            {usage.data ? (
                <DeleteAllDataDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    usage={usage.data}
                />
            ) : null}
        </>
    )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
import { Plus } from 'lucide-react'
import { useState, type ComponentPropsWithoutRef } from 'react'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { activeCaptureOptions, captureKeys } from '#front/pages/capture/api/capture-queries'
import { cn } from '@repo/utils'

type NewCaptureButtonProps = {
    label?: string
    compact?: boolean
} & ComponentPropsWithoutRef<'button'>

/**
 * Discards the currently open capture (stop + delete) and resets the
 * workspace so a fresh capture can be started.
 */
export function NewCaptureButton({
    label = 'New Capture',
    compact = false,
    className,
    ...rest
}: NewCaptureButtonProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const active = useQuery(activeCaptureOptions())
    const [confirmOpen, setConfirmOpen] = useState(false)
    const activeCaptureId = active.data?.captureId
    const reset = useMutation({
        mutationFn: async (captureId: string) => {
            await captureClient.stop(captureId)
            await captureClient.deleteCapture(captureId)
        },
        onSuccess: async () => {
            queryClient.setQueryData(captureKeys.active(), null)
            await queryClient.invalidateQueries({ queryKey: captureKeys.history() })
            setConfirmOpen(false)
            await navigate({ to: '/' })
        },
    })

    return (
        <>
            <Button
                variant="outline"
                size="default"
                className={className}
                onClick={() => (activeCaptureId ? setConfirmOpen(true) : void navigate({ to: '/' }))}
                aria-label="New capture"
                {...rest}
            >
                <Plus />
                <span className={cn(compact ? 'hidden md:inline' : undefined)}>{label}</span>
            </Button>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Stop and discard the current capture?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The running capture will stop and all of its retained packet data will
                            be permanently deleted before a new capture workspace opens.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {reset.error ? (
                        <p className="text-destructive text-sm" role="alert">
                            The current capture could not be discarded.
                        </p>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep capturing</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={reset.isPending}
                            onClick={(event) => {
                                event.preventDefault()
                                if (activeCaptureId) reset.mutate(activeCaptureId)
                            }}
                        >
                            {reset.isPending ? 'Stopping...' : 'Stop and discard'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

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
    Button,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@repo/ui'
import { FileOutput, LoaderCircle, Trash2 } from 'lucide-react'
import { useState, type ComponentPropsWithoutRef } from 'react'

import { captureClient } from '#front/pages/capture/api/capture-client'
import { activeCaptureOptions, captureKeys } from '#front/pages/capture/api/capture-queries'
import { useExportManager } from '#front/pages/captures/export-manager'
import { cn } from '@repo/utils'
import { useRegisterApplicationCommand } from '#front/commands/application-command-provider'

const terminalStates = new Set(['stopped', 'completed', 'failed'])

function captureIdFromPath(pathname: string) {
    if (!pathname.startsWith('/capture/')) return undefined
    const captureId = pathname.slice('/capture/'.length).split('/')[0]
    return captureId || undefined
}

function stateLabel(capture: CaptureRecord | null | undefined) {
    if (!capture) return 'Idle'
    if (capture.state === 'capturing') return 'Live'
    if (capture.state === 'stopping') return 'Stopping'
    return capture.state[0]!.toUpperCase() + capture.state.slice(1)
}

type CaptureTitlebarActionsProps = {
    pathname: string
    compact?: boolean
} & ComponentPropsWithoutRef<'div'>
export function CaptureTitlebarActions({
    pathname,
    compact = false,
    className,
    ...rest
}: CaptureTitlebarActionsProps) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { activeExports, aggregatePercent, openExportManager } = useExportManager()
    const routeCaptureId = captureIdFromPath(pathname)
    const active = useQuery(activeCaptureOptions())
    const routeCapture = useQuery({
        queryKey: ['capture', routeCaptureId, 'titlebar-record'],
        queryFn: () => captureClient.capture(routeCaptureId!),
        enabled: Boolean(routeCaptureId),
    })
    const [deleteOpen, setDeleteOpen] = useState(false)
    const currentCapture = routeCapture.data ?? active.data ?? undefined
    const exportCapture = routeCapture.data ?? active.data ?? undefined
    const routeIsTerminal = Boolean(
        routeCapture.data && terminalStates.has(routeCapture.data.state),
    )
    const remove = useMutation({
        mutationFn: (captureId: string) => captureClient.deleteCapture(captureId),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: captureKeys.history() })
            setDeleteOpen(false)
            await navigate({ to: '/' })
        },
    })

    useRegisterApplicationCommand('export-capture', {
        enabled: Boolean(exportCapture),
        disabledReason: 'No capture is available to export.',
        execute: () => openExportManager(exportCapture),
    })

    return (
        <div className={cn('flex items-center gap-1', className)} {...rest}>
            <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 px-2"
                onClick={() => {
                    const captureId = active.data?.captureId ?? routeCaptureId
                    if (captureId)
                        void navigate({
                            to: '/capture/$captureId',
                            params: { captureId },
                        })
                }}
                disabled={!currentCapture}
                aria-label={`Capture state: ${stateLabel(currentCapture)}`}
            >
                <span
                    className={cn(
                        'size-2 rounded-full',
                        active.data?.state === 'capturing'
                            ? 'bg-emerald-500 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-emerald-500)_18%,transparent)]'
                            : currentCapture?.state === 'failed'
                              ? 'bg-destructive'
                              : 'bg-muted-foreground/45',
                    )}
                />
                <span className={cn(compact ? 'hidden sm:inline' : undefined, 'uppercase')}>
                    {stateLabel(currentCapture)}
                </span>
            </Button>
            <Button
                variant="outline"
                size="default"
                className="relative overflow-hidden"
                onClick={() => openExportManager(exportCapture)}
                disabled={!exportCapture && activeExports.length === 0}
                aria-label={
                    activeExports.length > 0
                        ? `${activeExports.length} export${activeExports.length === 1 ? '' : 's'} in progress${aggregatePercent === null ? '' : `, ${aggregatePercent}% overall`}`
                        : 'Export capture'
                }
            >
                {activeExports.length > 0 ? (
                    <LoaderCircle className="animate-spin" />
                ) : (
                    <FileOutput />
                )}
                <span className={compact ? 'hidden md:inline' : 'hidden xl:inline'}>Export</span>
                {activeExports.length > 0 ? (
                    <span className="text-[10px] leading-none font-semibold tabular-nums">
                        {activeExports.length > 1 ? `${activeExports.length} · ` : ''}
                        {aggregatePercent === null ? '…' : `${aggregatePercent}%`}
                    </span>
                ) : null}
                {activeExports.length > 0 ? (
                    <span
                        aria-hidden
                        className="bg-primary absolute inset-x-0 bottom-0 h-0.5 origin-left transition-transform duration-300"
                        style={{
                            transform: `scaleX(${Math.max(0, aggregatePercent ?? 4) / 100})`,
                        }}
                    />
                ) : null}
            </Button>
            {routeIsTerminal ? (
                <Tooltip>
                    <TooltipTrigger
                        render={
                            <Button
                                variant="outline"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteOpen(true)}
                                aria-label="Delete capture"
                            >
                                <Trash2 />
                            </Button>
                        }
                    />
                    <TooltipContent>Delete capture</TooltipContent>
                </Tooltip>
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
                            onClick={() => routeCaptureId && remove.mutate(routeCaptureId)}
                        >
                            Delete capture
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}

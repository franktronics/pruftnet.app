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
    ToggleGroup,
    ToggleGroupItem,
    useIsMobile,
} from '@repo/ui'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@repo/ui/organisms'
import { Radio, Search } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { ToolbarSearch } from '#front/components/toolbar-search'
import { captureClient } from '#front/pages/capture/api/capture-client'
import { captureHistoryOptions, captureKeys } from '#front/pages/capture/api/capture-queries'
import { copyText } from '#front/pages/capture/model/copy-text'

import type { CaptureActionHandlers } from './capture-actions'
import { CaptureDetailsPanel } from './capture-details-panel'
import {
    type CaptureHistoryFilter,
    groupCapturesByDay,
    matchesCaptureFilter,
} from './capture-history'
import { CaptureHistoryList } from './capture-history-list'
import { useExportManager } from './export-manager'

const noCaptures: readonly CaptureRecord[] = []

const filterOptions: { value: CaptureHistoryFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'live', label: 'Live' },
    { value: 'issues', label: 'Issues' },
]

export function CapturesPage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const isMobile = useIsMobile()
    const { openExportManager } = useExportManager()
    const captures = useQuery(captureHistoryOptions())
    const [deleteCapture, setDeleteCapture] = useState<CaptureRecord>()
    const [selectedId, setSelectedId] = useState<string>()
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<CaptureHistoryFilter>('all')
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

    const allCaptures = captures.data?.captures ?? noCaptures
    const visibleCaptures = useMemo(
        () => allCaptures.filter((capture) => matchesCaptureFilter(capture, filter, search)),
        [allCaptures, filter, search],
    )
    const groups = useMemo(() => groupCapturesByDay(visibleCaptures), [visibleCaptures])
    const maxPackets = visibleCaptures.reduce((max, capture) => {
        const packets = BigInt(capture.packetCount)
        return packets > max ? packets : max
    }, 0n)
    // The inspector follows the selection, and falls back to the newest visible capture.
    const selected =
        visibleCaptures.find((capture) => capture.captureId === selectedId) ??
        groups[0]?.captures[0]
    const filtered = search.trim() !== '' || filter !== 'all'

    const handlers: CaptureActionHandlers = {
        onOpen: (capture) => open.mutate(capture.captureId),
        onExport: openExportManager,
        onCopyId: (capture) => void copyText(capture.captureId),
        onDelete: setDeleteCapture,
    }

    const list = (
        <div className="bg-background h-full min-h-0 overflow-auto">
            <CaptureHistoryList
                groups={groups}
                selectedId={selected?.captureId}
                maxPackets={maxPackets}
                onSelect={(capture) =>
                    isMobile ? handlers.onOpen(capture) : setSelectedId(capture.captureId)
                }
                onActivate={handlers.onOpen}
                handlers={handlers}
            />
            {!captures.isPending && allCaptures.length === 0 ? (
                <EmptyState
                    icon={<Radio />}
                    title="No retained captures"
                    description="Start a capture to create the first durable session."
                />
            ) : null}
            {!captures.isPending && allCaptures.length > 0 && visibleCaptures.length === 0 ? (
                <EmptyState icon={<Search />} title="No captures match these filters">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        onClick={() => {
                            setSearch('')
                            setFilter('all')
                        }}
                    >
                        Clear filters
                    </Button>
                </EmptyState>
            ) : null}
        </div>
    )

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ToolbarSearch
                value={search}
                onChange={setSearch}
                label="Capture history filter"
                placeholder="Filter by interface, capture ID, or failure..."
                count={
                    filtered
                        ? `${visibleCaptures.length.toLocaleString()} / ${allCaptures.length.toLocaleString()}`
                        : allCaptures.length.toLocaleString()
                }
            >
                <ToggleGroup
                    aria-label="Filter by state"
                    spacing={1}
                    value={[filter]}
                    onValueChange={(values) => {
                        // Single-choice group: ignore attempts to deselect the active filter.
                        const next = filterOptions.find((option) => option.value === values[0])
                        if (next) setFilter(next.value)
                    }}
                >
                    {filterOptions.map((option) => (
                        <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            className="text-muted-foreground data-pressed:bg-muted data-pressed:text-foreground px-2.5"
                        >
                            {option.label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
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

            <div className="min-h-0 min-w-0 flex-1">
                {isMobile ? (
                    list
                ) : (
                    <ResizablePanelGroup orientation="horizontal">
                        <ResizablePanel defaultSize="70%" minSize="45%">
                            {list}
                        </ResizablePanel>
                        <ResizableHandle />
                        <ResizablePanel defaultSize="30%" minSize="20%" maxSize="45%">
                            <CaptureDetailsPanel capture={selected} handlers={handlers} />
                        </ResizablePanel>
                    </ResizablePanelGroup>
                )}
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

function EmptyState({
    icon,
    title,
    description,
    children,
}: {
    icon: ReactNode
    title: string
    description?: string
    children?: ReactNode
}) {
    return (
        <div className="grid min-h-64 place-items-center p-8 text-center">
            <div className="[&>svg]:text-muted-foreground [&>svg]:mx-auto [&>svg]:mb-3 [&>svg]:size-6">
                {icon}
                <p className="text-sm font-medium">{title}</p>
                {description ? (
                    <p className="text-muted-foreground mt-1 text-xs">{description}</p>
                ) : null}
                {children}
            </div>
        </div>
    )
}

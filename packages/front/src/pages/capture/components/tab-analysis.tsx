import {
    Badge,
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@repo/ui/atoms'
import { AnalysisWorkflowGraph } from '@repo/ui/organisms'
import { cn, useQueryFetcher, useReactFlow } from '@repo/utils'
import { useEffect, type ComponentProps } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import { fetcher } from '../../../config/client-trpc'
import type { WorkflowEvent } from '@repo/core-node/types'

export type TabAnalysisProps = {} & Partial<ComponentProps<typeof ResizablePanelGroup>>

export const TabAnalysis = (props: TabAnalysisProps) => {
    const { className, ...rest } = props

    const { updateNodeData } = useReactFlow()
    const { selectedAnalysis, workflowEvents } = useScanControlContext()

    const { data: analysisData } = useQueryFetcher({
        procedure: fetcher.analysis.get.query({ analysisId: selectedAnalysis?.id! }),
        enabled: !!selectedAnalysis,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis', { id: selectedAnalysis?.id }],
        staleTime: Infinity,
    })
    const { id, data } = analysisData || ({} as { id: number; data: any })

    useEffect(() => {
        const nodeStatusMap = new Map<string, WorkflowEvent>()
        workflowEvents.forEach((event) => {
            if (event.type === 'node-status') {
                nodeStatusMap.set(`${event.nodeId}`, event)
            }
        })
        Array.from(nodeStatusMap.entries()).forEach(([nodeId, event]) => {
            if (event.type === 'node-status') {
                updateNodeData(nodeId, {
                    status: event.status,
                })
            }
        })
    }, [workflowEvents])

    return (
        <ResizablePanelGroup
            orientation="horizontal"
            className={cn('h-full min-h-0', className)}
            {...rest}
        >
            <ResizablePanel defaultSize="75%" minSize="60%">
                <AnalysisWorkflowGraph
                    analysisId={id!}
                    initialNodes={data?.nodes ?? []}
                    initialEdges={data?.edges ?? []}
                    initialViewport={data?.viewport ?? { x: 0, y: 0, zoom: 1 }}
                    dataAvailable={!!data}
                />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
                defaultSize="25%"
                minSize="20%"
                className="grid h-full min-h-0 grid-rows-[auto_1fr]"
            >
                <p className="border-b px-2 py-3 text-lg font-medium">Workflow events</p>
                {workflowEvents.length === 0 ? (
                    <div className="flex h-full min-h-0 items-center justify-center">
                        <p className="text-muted-foreground text-center text-lg">
                            Events related to the selected analysis workflow are displayed here.
                        </p>
                    </div>
                ) : (
                    <div className="scrollbar-thin h-full min-h-0 overflow-auto">
                        <div className="space-y-2 p-2">
                            {workflowEvents.map((event, index) => (
                                <EventCard key={index} data={event} />
                            ))}
                        </div>
                    </div>
                )}
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

type EventCardProps = {
    data: WorkflowEvent
} & ComponentProps<'div'>
const EventCard = (props: EventCardProps) => {
    const { data, className, ...rest } = props
    const { getNode } = useReactFlow()

    const meta = (() => {
        switch (data.type) {
            case 'node-status': {
                const tone = {
                    pending: 'muted',
                    running: 'info',
                    completed: 'success',
                    failed: 'destructive',
                    skipped: 'warning',
                }[data.status]
                const nodeName = getNode(data.nodeId)?.data?.name as string | undefined

                return {
                    title: 'Node status update',
                    description: (
                        <span>
                            Node{' '}
                            <span className="font-bold">{nodeName ? nodeName : data.nodeId}</span>{' '}
                            is {data.status}.
                        </span>
                    ),
                    badge: data.status,
                    tone,
                }
            }
            case 'node-error': {
                const nodeName = getNode(data.nodeId)?.data?.name
                return {
                    title: `Node error${nodeName ? ` in node ${nodeName}` : ''}`,
                    description: <span>{data.errorMessage}</span>,
                    badge: 'error',
                    tone: 'destructive',
                }
            }
            case 'node-info': {
                const nodeName = getNode(data.nodeId)?.data?.name
                return {
                    title: `Notification${nodeName ? ` for node ${nodeName}` : ''}`,
                    description: <span>{data.message}</span>,
                    badge: 'info',
                    tone: 'info',
                }
            }
            case 'node-warning': {
                const nodeName = getNode(data.nodeId)?.data?.name
                return {
                    title: `Warning${nodeName ? ` for node ${nodeName}` : ''}`,
                    description: <span>{data.message}</span>,
                    badge: 'warning',
                    tone: 'warning',
                }
            }
            case 'workflow-start':
                return {
                    title: 'Workflow started',
                    description: 'Execution of the analysis workflow has started.',
                    badge: 'info',
                    tone: 'info',
                }
            case 'workflow-complete':
                return {
                    title: 'Workflow completed',
                    description: 'Execution of the analysis workflow has finished.',
                    badge: 'success',
                    tone: 'success',
                }
        }
    })() as {
        title: string
        description: string
        badge: string
        tone: 'success' | 'warning' | 'info' | 'destructive' | 'muted'
    }

    const toneClasses = {
        success: 'border-l-success/60 bg-success/5',
        warning: 'border-l-warning/60 bg-warning/5',
        info: 'border-l-info/60 bg-info/5',
        destructive: 'border-l-destructive/60 bg-destructive/5',
        muted: 'border-l-muted-foreground/30 bg-muted/40',
    } as const

    const badgeClasses = {
        success: 'border-success/40 text-success',
        warning: 'border-warning/40 text-warning',
        info: 'border-info/40 text-info',
        destructive: 'border-destructive/40 text-destructive',
        muted: 'border-muted-foreground/40 text-muted-foreground',
    } as const

    return (
        <Card
            className={cn(
                'gap-3 rounded-none border-l-4 p-3 shadow-none',
                toneClasses[meta.tone],
                className,
            )}
            {...rest}
        >
            <CardHeader className="p-0">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                        <CardTitle className="text-sm">{meta.title}</CardTitle>
                        <CardDescription className="text-xs">{meta.description}</CardDescription>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                            variant="outline"
                            className={cn('text-[10px] uppercase', badgeClasses[meta.tone])}
                        >
                            {meta.badge}
                        </Badge>
                        <span className="text-muted-foreground text-[10px]">
                            {formatTimestamp(data.timestamp)}
                        </span>
                    </div>
                </div>
            </CardHeader>
        </Card>
    )
}

const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

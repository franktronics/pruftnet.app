import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@repo/ui/atoms'
import { AnalysisWorkflowGraph } from '@repo/ui/organisms'
import { cn, useQueryFetcher } from '@repo/utils'
import { type ComponentProps } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import { fetcher } from '../../../config/client-trpc'

export type TabAnalysisProps = {} & Partial<ComponentProps<typeof ResizablePanelGroup>>

export const TabAnalysis = (props: TabAnalysisProps) => {
    const { direction, className, ...rest } = props

    const { selectedAnalysis } = useScanControlContext()
    const { data: analysisData } = useQueryFetcher({
        procedure: fetcher.analysis.get.query({ analysisId: selectedAnalysis?.id! }),
        enabled: !!selectedAnalysis,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis', { id: selectedAnalysis?.id }],
        staleTime: Infinity,
    })
    const { id, data } = analysisData || ({} as { id: number; data: any })

    return (
        <ResizablePanelGroup direction="horizontal" className={cn('h-full', className)} {...rest}>
            <ResizablePanel defaultSize={80} minSize={75}>
                <AnalysisWorkflowGraph
                    className="h-full w-full"
                    analysisId={id!}
                    initialNodes={data?.nodes ?? []}
                    initialEdges={data?.edges ?? []}
                />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={20} minSize={10}>
                event
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

import { AnalysisGraph } from '@repo/ui/organisms'
import {
    cn,
    queryClient,
    useMutateFetcher,
    type Edge,
    type Node,
    type ReactFlowJsonObject,
} from '@repo/utils'
import { type ComponentProps } from 'react'
import { fetcher } from '../../../config/client-trpc'
import type { Analysis } from '@repo/core-node/types'

export type AnalysisMapProps = {
    analysis: Analysis | undefined
    isLoading: boolean
} & ComponentProps<'div'>

export const AnalysisMap = (props: AnalysisMapProps) => {
    const { className, analysis, isLoading, ...rest } = props
    const { id, data } = analysis || ({} as { id: number; data: any })

    const { mutateData: updateGraph, isPending: savingGraph } = useMutateFetcher({
        procedure: fetcher.analysis.store,
        popupOnFetching: {
            fetching: 'Saving graph...',
            success: 'Settings updated successfully.',
        },
        popupOnError: true,
    })

    const handleSave = async (instance: ReactFlowJsonObject<Node, Edge>) => {
        await updateGraph({
            analysisId: analysis?.id || 0,
            data: instance,
        })
        await queryClient.invalidateQueries({ queryKey: ['analysis', { id }] })
        await queryClient.invalidateQueries({ queryKey: ['analysis_list'] })
    }

    if (!analysis && !isLoading) {
        return (
            <section className={cn('h-full w-full', className)} {...rest}>
                <div className="text-foreground flex h-full w-full items-center justify-center">
                    Select an analysis to view its map.
                </div>
            </section>
        )
    }

    return (
        <section className={cn('h-full w-full', className)} {...rest}>
            {!isLoading ? (
                <AnalysisGraph
                    className="h-full w-full"
                    analysisId={analysis?.id ?? 0}
                    initialNodes={data?.nodes ?? []}
                    initialEdges={data?.edges ?? []}
                    initialViewport={data?.viewport ?? { x: 0, y: 0, zoom: 1 }}
                    onSave={handleSave}
                    isSaving={savingGraph}
                />
            ) : (
                <div className="text-foreground flex h-full w-full items-center justify-center">
                    Loading analysis...
                </div>
            )}
        </section>
    )
}

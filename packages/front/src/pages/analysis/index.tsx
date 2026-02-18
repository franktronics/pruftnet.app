import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { AnalysisList } from './components/analysis-list'
import { AnalysisMap } from './components/analysis-map'
import { fetcher } from '../../config/client-trpc'
import { useQueryFetcher } from '@repo/utils'
import { useState } from 'react'

function Analysis() {
    const { data } = useQueryFetcher({
        procedure: fetcher.analysis.list.query({}),
        enabled: true,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis_list'],
        staleTime: Infinity,
    })

    const [selectedId, setSelectedId] = useState<number | null>(null)
    const { data: selectedAnalysis, isLoading: loadingAnalysis } = useQueryFetcher({
        procedure: fetcher.analysis.get.query({ analysisId: selectedId ?? 0 }),
        enabled: selectedId !== null,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis', { id: selectedId }],
        staleTime: Infinity,
    })

    return (
        <ResizablePanelGroup orientation="horizontal" className="h-full">
            <ResizablePanel defaultSize="20%" minSize="10%">
                <AnalysisList
                    analysisList={data ?? []}
                    onSelectAnalysis={setSelectedId}
                    selectedAnalysisId={selectedId}
                />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="80%" minSize="75%">
                <AnalysisMap analysis={selectedAnalysis} isLoading={loadingAnalysis} />
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

export default Analysis

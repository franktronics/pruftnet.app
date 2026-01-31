import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { AnalysisList } from './components/analysis-list'
import { AnalysisMap } from './components/analysis-map'
import { fetcher } from '../../config/client-trpc'
import { useQueryFetcher } from '@repo/utils'

function Analysis() {
    const { data } = useQueryFetcher({
        procedure: fetcher.analysis.list.query({}),
        enabled: true,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis_list'],
        staleTime: Infinity,
    })

    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={20} minSize={10}>
                <AnalysisList analysisList={data ?? []} />
            </ResizablePanel>

            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={80} minSize={75}>
                <AnalysisMap />
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

export default Analysis

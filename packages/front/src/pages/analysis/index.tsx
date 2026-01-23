import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { AnalysisList } from './components/analysis-list'
import { AnalysisMap } from './components/analysis-map'

function Analysis() {
    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={15} minSize={10}>
                <AnalysisList />
            </ResizablePanel>

            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={85} minSize={75}>
                <AnalysisMap />
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

export default Analysis

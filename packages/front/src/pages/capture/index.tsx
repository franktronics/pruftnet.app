import {
    TabsDisplay,
    TabsDisplayList,
    TabsDisplayTrigger,
    TabsDisplayContent,
} from '@repo/ui/atoms'
import { Layout } from './layout'
import { TabScan } from './components/tab-scan'
import { TabGraph } from './components/tab-graph'
import { TabAnalysis } from './components/tab-analysis'
import { ActionsControl } from './components/actions-control'
import { CaptureFilter } from './components/capture-filter'
import { InterfaceSelector } from './components/interface-selector'
import { useSettingsContext } from '../settings/context/settings-context'
import { AnalysisSelector } from './components/analysis-selector'
import { Network, Table, Workflow } from 'lucide-react'
import { ReactFlowProvider } from '@repo/ui/organisms'

function Capture() {
    const { appSettings } = useSettingsContext()

    return (
        <Layout>
            <TabsDisplay
                defaultValue={appSettings.defaultCaptureTab}
                className="flex flex-1 flex-col"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <InterfaceSelector />
                        <ActionsControl />
                        <AnalysisSelector className="pl-2" />
                    </div>
                    <TabsDisplayList>
                        <TabsDisplayTrigger value="scan">
                            <Table /> Packet Capture
                        </TabsDisplayTrigger>
                        <TabsDisplayTrigger value="graph">
                            <Network />
                            Network Graph
                        </TabsDisplayTrigger>
                        <TabsDisplayTrigger value="analysis">
                            <Workflow />
                            Analysis Workflow
                        </TabsDisplayTrigger>
                    </TabsDisplayList>
                </div>

                <TabsDisplayContent value="scan" className="flex flex-1 flex-col pt-2">
                    <CaptureFilter className="shrink-0 pb-2" />
                    <TabScan className="h-full w-full flex-1" />
                </TabsDisplayContent>
                <TabsDisplayContent value="graph" className="flex flex-1 flex-col">
                    <ReactFlowProvider>
                        <TabGraph className="h-full w-full flex-1" />
                    </ReactFlowProvider>
                </TabsDisplayContent>
                <TabsDisplayContent value="analysis" className="flex flex-1 flex-col">
                    <ReactFlowProvider>
                        <TabAnalysis className="h-full w-full flex-1" />
                    </ReactFlowProvider>
                </TabsDisplayContent>
            </TabsDisplay>
        </Layout>
    )
}

export default Capture

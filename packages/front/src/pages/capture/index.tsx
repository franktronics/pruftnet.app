import { Tabs, TabsList, TabsTrigger, TabsContent } from '@repo/ui/atoms'
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
            <Tabs
                defaultValue={appSettings.defaultCaptureTab}
                className="flex h-full min-h-0 flex-1 flex-col"
            >
                <article className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <InterfaceSelector />
                        <ActionsControl />
                        <AnalysisSelector className="pl-2" />
                    </div>
                    <TabsList>
                        <TabsTrigger value="scan">
                            <Table /> Packet Capture
                        </TabsTrigger>
                        <TabsTrigger value="graph">
                            <Network />
                            Network Graph
                        </TabsTrigger>
                        <TabsTrigger value="analysis">
                            <Workflow />
                            Analysis Workflow
                        </TabsTrigger>
                    </TabsList>
                </article>

                <TabsContent value="scan" className="flex min-h-0 flex-1 flex-col pt-2">
                    <CaptureFilter className="shrink-0 pb-2" />
                    <TabScan className="h-full w-full flex-1" />
                </TabsContent>
                <TabsContent value="graph" className="flex min-h-0 flex-1 flex-col">
                    <ReactFlowProvider>
                        <TabGraph className="h-full w-full flex-1" />
                    </ReactFlowProvider>
                </TabsContent>
                <TabsContent value="analysis" className="flex min-h-0 flex-1 flex-col">
                    <ReactFlowProvider>
                        <TabAnalysis className="h-full w-full flex-1" />
                    </ReactFlowProvider>
                </TabsContent>
            </Tabs>
        </Layout>
    )
}

export default Capture

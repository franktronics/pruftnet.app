import {
    TabsDisplay,
    TabsDisplayList,
    TabsDisplayTrigger,
    TabsDisplayContent,
} from '@repo/ui/atoms'
import { Layout } from './layout'
import { TabScan } from './components/tab-scan'
import { TabGraph } from './components/tab-graph'
import { ActionsControl } from './components/actions-control'
import { ScanControlProvider } from './stores/scan-control.context'
import { CaptureFilter } from './components/capture-filter'

function HomeContent() {
    return (
        <Layout>
            <TabsDisplay defaultValue="graph" className="flex flex-1 flex-col">
                <div className="flex shrink-0 items-center gap-2">
                    <TabsDisplayList>
                        <TabsDisplayTrigger value="scan">Scan</TabsDisplayTrigger>
                        <TabsDisplayTrigger value="graph">Graph</TabsDisplayTrigger>
                    </TabsDisplayList>
                    <ActionsControl />
                </div>
                <TabsDisplayContent value="scan" className="flex flex-1 flex-col pt-2">
                    <CaptureFilter className="shrink-0 pb-2" />
                    <TabScan className="h-full w-full flex-1" />
                </TabsDisplayContent>

                <TabsDisplayContent value="graph" className="flex flex-1 flex-col">
                    <TabGraph className="h-full w-full flex-1" />
                </TabsDisplayContent>
            </TabsDisplay>
        </Layout>
    )
}

function Index() {
    return (
        <ScanControlProvider>
            <HomeContent />
        </ScanControlProvider>
    )
}

export default Index

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
import { ScanControlProvider } from './context/scan-control-context'
import { CaptureFilter } from './components/capture-filter'
import { InterfaceSelector } from './components/interface-selector'
import { useSettingsContext } from '../settings/context/settings-context'

function HomeContent() {
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
                    </div>
                    <TabsDisplayList>
                        <TabsDisplayTrigger value="graph">Graph</TabsDisplayTrigger>
                        <TabsDisplayTrigger value="scan">Scan</TabsDisplayTrigger>
                    </TabsDisplayList>
                </div>

                <TabsDisplayContent value="graph" className="flex flex-1 flex-col">
                    <TabGraph className="h-full w-full flex-1" />
                </TabsDisplayContent>
                <TabsDisplayContent value="scan" className="flex flex-1 flex-col pt-2">
                    <CaptureFilter className="shrink-0 pb-2" />
                    <TabScan className="h-full w-full flex-1" />
                </TabsDisplayContent>
            </TabsDisplay>
        </Layout>
    )
}

function Capture() {
    return (
        <ScanControlProvider>
            <HomeContent />
        </ScanControlProvider>
    )
}

export default Capture

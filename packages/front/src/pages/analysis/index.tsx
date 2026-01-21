import {
    TabsDisplay,
    TabsDisplayList,
    TabsDisplayTrigger,
    TabsDisplayContent,
} from '@repo/ui/atoms'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { StepsBuilder } from './components/steps-builder'
import { StepsComponents } from './components/steps-components'
import { StepsProperty } from './components/steps-property'

function Analysis() {
    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={20} minSize={15} className="p-4">
                <div>OK</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={30} className="p-4">
                <StepsBuilder />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={30} className="p-4">
                <TabsDisplay defaultValue="comp">
                    <TabsDisplayList className="ml-auto">
                        <TabsDisplayTrigger value="prop">Property</TabsDisplayTrigger>
                        <TabsDisplayTrigger value="comp">Steps Components</TabsDisplayTrigger>
                    </TabsDisplayList>
                    <TabsDisplayContent value="prop">
                        <StepsProperty />
                    </TabsDisplayContent>
                    <TabsDisplayContent value="comp">
                        <StepsComponents />
                    </TabsDisplayContent>
                </TabsDisplay>
            </ResizablePanel>
        </ResizablePanelGroup>
    )
}

export default Analysis

import { useState } from 'react'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@repo/ui/organisms'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/molecules'

import { CaptureControlBar } from './capture-control-bar'
import { CaptureStatsPanel } from './capture-stats'
import { DisplayFilter } from './display-filter'
import { PacketBytes } from './packet-bytes'
import { PacketTable } from './packet-table'
import { PacketTree } from './packet-tree'

const ignorePacket = () => undefined

export function IdleCaptureWorkspace() {
    const [displayFilter, setDisplayFilter] = useState('')
    return (
        <div className="bg-border flex h-full min-h-0 flex-col overflow-hidden">
            <CaptureControlBar />
            <DisplayFilter value={displayFilter} onChange={setDisplayFilter} />
            <div className="hidden min-h-0 flex-1 md:block">
                <ResizablePanelGroup orientation="vertical">
                    <ResizablePanel defaultSize="58%" minSize="30%">
                        <ResizablePanelGroup orientation="horizontal">
                            <ResizablePanel defaultSize="74%" minSize="45%">
                                <PacketTable
                                    rows={[]}
                                    onSelect={ignorePacket}
                                    following
                                    onPauseFollowing={ignorePacket}
                                    emptyMessage="Select an interface and start capture to collect packets."
                                />
                            </ResizablePanel>
                            <ResizableHandle />
                            <ResizablePanel defaultSize="26%" minSize="18%">
                                <CaptureStatsPanel />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ResizablePanel>
                    <ResizableHandle />
                    <ResizablePanel defaultSize="42%" minSize="22%">
                        <ResizablePanelGroup orientation="horizontal">
                            <ResizablePanel defaultSize="44%" minSize="25%">
                                <PacketTree onSelect={ignorePacket} />
                            </ResizablePanel>
                            <ResizableHandle />
                            <ResizablePanel defaultSize="56%" minSize="30%">
                                <PacketBytes onSelectByte={ignorePacket} />
                            </ResizablePanel>
                        </ResizablePanelGroup>
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
                <div className="min-h-0 flex-[3]">
                    <PacketTable
                        rows={[]}
                        onSelect={ignorePacket}
                        following
                        onPauseFollowing={ignorePacket}
                        emptyMessage="Select an interface and start capture."
                    />
                </div>
                <Tabs
                    defaultValue="structure"
                    className="bg-background min-h-0 flex-[2] gap-0 border-t"
                >
                    <TabsList className="h-9 w-full rounded-none border-b bg-transparent p-0">
                        <TabsTrigger value="stats">Stats</TabsTrigger>
                        <TabsTrigger value="structure">Structure</TabsTrigger>
                        <TabsTrigger value="bytes">Bytes</TabsTrigger>
                    </TabsList>
                    <TabsContent value="stats" className="min-h-0 flex-1">
                        <CaptureStatsPanel />
                    </TabsContent>
                    <TabsContent value="structure" className="min-h-0 flex-1">
                        <PacketTree onSelect={ignorePacket} />
                    </TabsContent>
                    <TabsContent value="bytes" className="min-h-0 flex-1">
                        <PacketBytes onSelectByte={ignorePacket} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

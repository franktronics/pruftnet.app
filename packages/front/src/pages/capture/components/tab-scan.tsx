import { useState, type ComponentPropsWithoutRef } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { PacketsTable } from './packets-table'
import { PacketHexViewer } from './packet-hex-viewer'
import { PacketValuesViewer } from './packet-values-viewer'
import { useScanControlContext } from '../context/scan-control-context'
import { fetcher } from '../../../config/client-trpc'
import { useQueries, useQueryFetcher } from '@repo/utils'

export type TabScanProps = {} & ComponentPropsWithoutRef<'section'>
export const TabScan = (props: TabScanProps) => {
    const { children, className, ...rest } = props

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const { packets } = useScanControlContext()

    const { data: packetData } = useQueryFetcher({
        procedure: fetcher.scan.packetData.query({ id: selectedIndex }),
        queryKey: ['packet', selectedIndex],
        staleTime: Infinity,
        enabled: selectedIndex !== null,
        retry: 0,
        popupOnError: true,
    })
    const protoFileQueries = useQueries({
        queries: packetData
            ? packetData.parsed.map((elt) => {
                  return {
                      queryKey: ['protocol_file', elt.file],
                      queryFn: fetcher.protocolFiles.getByPath.query({ path: elt.file }),
                      staleTime: Infinity,
                      enabled: !!elt.file,
                      retry: 0,
                  }
              })
            : [],
    })

    const handleRowSelect = async (index: number) => {
        if (index === selectedIndex) {
            setSelectedIndex(null)
            return
        }
        setSelectedIndex(index)
    }

    return (
        <section className={className} {...rest}>
            <ResizablePanelGroup direction="vertical" className="h-full">
                <ResizablePanel defaultSize={60} minSize={30}>
                    <div className="h-full pb-2">
                        <PacketsTable
                            className="h-full"
                            packets={packets}
                            onHandleRowSelect={handleRowSelect}
                            selectedRow={selectedIndex}
                            protoFileQueries={protoFileQueries}
                        />
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={40} minSize={20}>
                    <ResizablePanelGroup direction="horizontal">
                        <ResizablePanel defaultSize={40} minSize={30}>
                            <div className="h-full">
                                <PacketValuesViewer />
                            </div>
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        <ResizablePanel defaultSize={60} minSize={30}>
                            <div className="h-full">
                                <PacketHexViewer
                                    data={packetData ? packetData.raw.data : null}
                                    className="h-full"
                                />
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </section>
    )
}

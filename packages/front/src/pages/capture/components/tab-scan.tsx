import { useState, type ComponentPropsWithoutRef } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { PacketsTable } from './packets-table'
import { PacketHexViewer } from './packet-hex-viewer'
import { PacketValuesViewer } from './packet-values-viewer'
import { useScanControlContext } from '../context/scan-control-context'
import { fetcher } from '../../../config/client-trpc'
import { useQueryFetcher } from '@repo/utils'
import type { PacketData } from '@repo/core-node/types'

export type TabScanProps = {} & ComponentPropsWithoutRef<'section'>
export const TabScan = (props: TabScanProps) => {
    const { children, className, ...rest } = props

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [selectedPacket, setSelectedPacket] = useState<PacketData | null>(null)
    const { packets } = useScanControlContext()

    const { fetchData: getPacketData } = useQueryFetcher({
        procedure: fetcher.scan.packetData.query({ id: selectedIndex }),
        queryKey: ['packet', selectedIndex],
        staleTime: Infinity,
        retry: 0,
        popupOnError: true,
    })

    const handleRowSelect = async (index: number | null) => {
        if (index === null) {
            setSelectedPacket(null)
            setSelectedIndex(null)
            return
        }
        setSelectedIndex(index)

        const packetData = await fetcher.scan.packetData.query({ id: index })()
        if (packetData) {
            const decodedData = Uint8Array.from(atob(packetData.raw.data), (c) => c.charCodeAt(0))
            setSelectedPacket({
                ...packetData,
                raw: {
                    ...packetData.raw,
                    data: decodedData,
                },
            })
        } else {
            setSelectedPacket(null)
        }
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
                                    data={selectedPacket ? selectedPacket.raw.data : null}
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

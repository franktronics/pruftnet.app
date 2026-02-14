import { useState, type ComponentPropsWithoutRef } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { PacketsTable } from './packets-table'
import { PacketHexViewer } from './packet-hex-viewer'
import { PacketValuesViewer } from './packet-values-viewer'
import { useScanControlContext } from '../context/scan-control-context'
import { fetcher } from '../../../config/client-trpc'
import { useQueries, useQueryFetcher } from '@repo/utils'
import type { ProtocolFileData } from '@repo/core-node/types'

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
    const protoFiles = useQueries({
        queries: (packetData?.parsed ?? []).map((elt) => {
            return {
                queryKey: ['protocol_file', elt.file],
                staleTime: Infinity,
                enabled: !!elt.file && selectedIndex !== null,
                retry: 0,
                queryFn: fetcher.protocolFiles.getByPath.query({ path: elt.file }),
            }
        }),
        combine: (
            results,
        ): Record<string, ProtocolFileData & { pending: boolean; error: Error | null }> => {
            return Object.fromEntries(
                results
                    .filter((res) => !!res.data && !!res.data.path)
                    .map(
                        (res) =>
                            [
                                res.data?.path,
                                { ...res.data, pending: res.isPending, error: res.error },
                            ] as const,
                    ),
            )
        },
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
            <ResizablePanelGroup orientation="vertical" className="h-full">
                <ResizablePanel defaultSize="60%" minSize="30%">
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

                <ResizablePanel defaultSize="40%" minSize="20%">
                    <ResizablePanelGroup orientation="horizontal">
                        <ResizablePanel defaultSize="40%" minSize="30%">
                            <div className="h-full">
                                <PacketValuesViewer packet={packetData} protoFiles={protoFiles} />
                            </div>
                        </ResizablePanel>

                        <ResizableHandle withHandle />

                        <ResizablePanel defaultSize="60%" minSize="30%">
                            <div className="h-full">
                                <PacketHexViewer packet={packetData} className="h-full" />
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </section>
    )
}

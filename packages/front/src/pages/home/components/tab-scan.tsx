import { useState, type ComponentPropsWithoutRef } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { PacketsTable, type RowDataType } from './packets-table'
import { PacketHexViewer } from './packet-hex-viewer'
import { PacketValuesViewer } from './packet-values-viewer'
import { usePacketTable } from '../hooks/use-packet-table'
import { useScanControlContext } from '../stores/scan-control.context'

const fakePacketData = new Uint8Array([
    0x33, 0x33, 0x00, 0x00, 0x00, 0xfb, 0x00, 0xe0, 0x4c, 0x68, 0x0a, 0x4d, 0x86, 0xdd, 0x60, 0x0a,
    0x0c, 0x00, 0x00, 0x5b, 0x11, 0xff, 0xfe, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04,
    0xa7, 0xc7, 0x87, 0x8a, 0xbf, 0xa3, 0xff, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0xfb, 0x14, 0xe9, 0x14, 0xe9, 0x00, 0x5b, 0xdf, 0x94, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x25, 0x5f, 0x30, 0x30, 0x30, 0x30,
    0x30, 0x30, 0x30, 0x34, 0x2d, 0x65, 0x36, 0x37, 0x61, 0x2d, 0x32, 0x32, 0x65, 0x39, 0x2d, 0x38,
    0x37, 0x35, 0x34, 0x2d, 0x37, 0x36, 0x61, 0x31, 0x38, 0x32, 0x32, 0x34, 0x34, 0x37, 0x62, 0x36,
    0x04, 0x5f, 0x73, 0x75, 0x62, 0x0b, 0x5f, 0x61, 0x70, 0x70, 0x6c, 0x65, 0x74, 0x76, 0x2d, 0x76,
    0x32, 0x04, 0x5f, 0x74, 0x63, 0x70, 0x05, 0x6c, 0x6f, 0x63, 0x61, 0x6c, 0x00, 0x00, 0x0c, 0x00,
    0x01,
])

export type TabScanProps = {} & ComponentPropsWithoutRef<'section'>
export const TabScan = (props: TabScanProps) => {
    const { children, className, ...rest } = props

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const { rawPackets } = useScanControlContext()

    const handleRowSelect = (index: number | null) => {
        setSelectedIndex(index)
    }

    const packetsData: RowDataType[] = rawPackets.map(({ parsed, raw, id }) => {
        return {
            index: id,
            time: (Date.now() - new Date(raw.timestamp).getTime()) / 1000,
            src:
                parsed.protocols
                    .find((p: any) => p.name === 'IPv4')
                    ?.fields.find((f: any) => f.name === 'Source Address')?.valueAsString || '',
            dest:
                parsed.protocols
                    .find((p: any) => p.name === 'IPv4')
                    ?.fields.find((f: any) => f.name === 'Destination Address')?.valueAsString ||
                '',
            protocol: parsed.protocols.map((p: any) => p.name).at(-1) || 'Unknown',
            length: raw.length,
            info: parsed.protocols.map((p: any) => p.name).join(', '),
        }
    })

    return (
        <section className={className} {...rest}>
            <ResizablePanelGroup direction="vertical" className="h-full">
                <ResizablePanel defaultSize={60} minSize={30}>
                    <div className="h-full pb-2">
                        <PacketsTable
                            className="h-full"
                            data={packetsData}
                            onHandleRowSelect={handleRowSelect}
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
                                <PacketHexViewer data={fakePacketData} className="h-full" />
                            </div>
                        </ResizablePanel>
                    </ResizablePanelGroup>
                </ResizablePanel>
            </ResizablePanelGroup>
        </section>
    )
}

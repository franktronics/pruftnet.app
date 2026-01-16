import { type ComponentPropsWithoutRef } from 'react'
import { cn } from '@repo/utils'
import type { ProtocolFileData, UseQueryResult } from '@repo/core-node/types'

export type PacketValuesViewerProps = {
    protoFileQueries: UseQueryResult<ProtocolFileData | undefined, Error>[]
} & ComponentPropsWithoutRef<'div'>

export const PacketValuesViewer = (props: PacketValuesViewerProps) => {
    const { className, protoFileQueries, ...rest } = props

    const mockPacketStructure = [
        { name: 'Frame', size: 114, expanded: true },
        { name: 'Ethernet II', size: 14, expanded: true },
        { name: 'Internet Protocol Version 4', size: 20, expanded: false },
        { name: 'Transmission Control Protocol', size: 32, expanded: false },
        { name: 'Hypertext Transfer Protocol', size: 48, expanded: false },
    ]

    return (
        <div
            className={cn(
                'bg-card rounded-lg p-4',
                'font-mono text-sm',
                'scrollbar-thin h-full overflow-auto',
                className,
            )}
            {...rest}
        >
            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                Packet Structure
            </div>
            <div className="space-y-1">
                {mockPacketStructure.map((layer, index) => (
                    <div key={index} className="group">
                        <div className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center rounded p-1 transition-colors">
                            <span className="text-muted-foreground mr-2">
                                {layer.expanded ? '▼' : '▶'}
                            </span>
                            <span className="flex-1">{layer.name}</span>
                            <span className="text-muted-foreground text-xs">
                                ({layer.size} bytes)
                            </span>
                        </div>
                        {layer.expanded && (
                            <div className="mt-1 ml-6 space-y-1">
                                <div className="text-muted-foreground border-border border-l pl-4 text-xs">
                                    Version: 4
                                </div>
                                <div className="text-muted-foreground border-border border-l pl-4 text-xs">
                                    Header Length: 20 bytes
                                </div>
                                <div className="text-muted-foreground border-border border-l pl-4 text-xs">
                                    Total Length: {layer.size}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { Radar } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'

export type ArpScanNodeData = Node<{ name: string }, 'arp-scan'>
export type ArpScanProps = {
    className?: string
} & NodeProps<ArpScanNodeData>

export const ArpScan = (props: ArpScanProps) => {
    const { selected = false, className } = props

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block>
                <Handle
                    position={Position.Left}
                    type="target"
                    style={{
                        background: 'none',
                        border: 'none',
                        width: '0.75em',
                        height: '0.75em',
                    }}
                >
                    <div
                        className={cn(
                            'border-background bg-primary border-2',
                            'pointer-events-none size-3 rounded-full',
                            'absolute -left-0.5',
                        )}
                    ></div>
                </Handle>

                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-primary/10 text-primary rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Radar className="size-5" />
                    </div>
                    <div>ARP</div>
                </div>

                <Handle
                    position={Position.Right}
                    type="source"
                    style={{
                        background: 'none',
                        border: 'none',
                        width: '0.75em',
                        height: '0.75em',
                    }}
                >
                    <div
                        className={cn(
                            'border-background bg-primary border-2',
                            'pointer-events-none size-3 rounded-full',
                            'absolute -right-0.5',
                        )}
                    ></div>
                </Handle>
            </NodeLayout.Block>
            <NodeLayout.Popup title="ARP Scan Node">
                <NodeLayout.Params>OK Param</NodeLayout.Params>
                <NodeLayout.Settings>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

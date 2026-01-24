import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { ArrowDown } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'

export type IpRangeNodeData = Node<{ name: string }, 'ip-range'>
export type IpRangeProps = {
    className?: string
} & NodeProps<IpRangeNodeData>

export const IpRange = (props: IpRangeProps) => {
    const { selected = false, className } = props

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block className={className} contentClass="rounded-l-2xl p-2">
                <div className="flex items-center gap-2">
                    <div className="bg-chart-2/20 rounde flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-2 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">192.168.208.121</p>
                </div>

                <div className="flex items-center justify-center">
                    <ArrowDown className="text-muted-foreground size-3" strokeWidth={2.5} />
                </div>

                <div className="flex items-center gap-2">
                    <div className="bg-chart-5/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-5 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">192.168.208.128</p>
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
            <NodeLayout.Popup title="IP Range Settings">
                <NodeLayout.Params>OK Param</NodeLayout.Params>
                <NodeLayout.Settings>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
        </NodeLayout.Root>
    )
}

import { ReactNode } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'

export type NetworkOutputNodeData = Node<
    {
        name: string
        icon: ReactNode
    },
    'net-output'
>
export type NetworkOutputProps = {
    className?: string
} & NodeProps<NetworkOutputNodeData>

export const NetworkOutput = (props: NetworkOutputProps) => {
    const { selected = false, className } = props
    const { icon } = props.data

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block contentClass="rounded-l-lg rounded-r-4xl">
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
                <div
                    className={cn(
                        'bg-primary/10 text-primary transition-colors',
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                    )}
                >
                    <div className="[&>svg]:size-5">{icon}</div>
                </div>
            </NodeLayout.Block>
            <NodeLayout.Popup title="Network Output Settings">
                <NodeLayout.Params>OK Param</NodeLayout.Params>
                <NodeLayout.Settings>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

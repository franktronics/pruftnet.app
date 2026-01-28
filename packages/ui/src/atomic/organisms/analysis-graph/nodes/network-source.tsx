import type { ReactNode, ComponentProps } from 'react'
import { type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'
import { NodeHandle } from '../nodes-layout/node-handle'

export type NetworkSourceNodeData = Node<{
    name: string
    icon: ReactNode
}>
export type NetworkSourceProps = {
    selected?: boolean
} & NodeProps<NetworkSourceNodeData> &
    ComponentProps<'div'>

export const NetworkSource = (props: NetworkSourceProps) => {
    const { selected = false, className } = props
    const { icon } = props.data

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block contentClass="rounded-l-4xl rounded-r-lg">
                <div
                    className={cn(
                        'bg-primary/10 text-primary transition-colors',
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                    )}
                >
                    <div className="[&>svg]:size-5">{icon}</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="Network Source Settings">
                <NodeLayout.Params>OK Param</NodeLayout.Params>
                <NodeLayout.Settings>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

import type { ComponentProps } from 'react'
import { type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'
import { NodeHandle } from '../components'
import { Network } from 'lucide-react'
import { BasicNodeData } from './utils'

export type NetworkSourceNodeData = Node<{ name: string } & BasicNodeData, 'net-source'>
export type NetworkSourceProps = {
    selected?: boolean
} & NodeProps<NetworkSourceNodeData> &
    ComponentProps<'div'>

export const NodeNetworkSource = (props: NetworkSourceProps) => {
    const { selected = false, className } = props
    const {} = props.data

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block contentClass="rounded-l-4xl rounded-r-lg">
                <div
                    className={cn(
                        'bg-primary/10 text-primary transition-colors',
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                    )}
                >
                    <div className="[&>svg]:size-5">
                        <Network />
                    </div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="Network Source Settings">
                <NodeLayout.Params disabled={true}>OK Param</NodeLayout.Params>
                <NodeLayout.Settings disabled={true}>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

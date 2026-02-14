import { type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'
import { NodeHandle } from '../components'
import { EthernetPort } from 'lucide-react'
import { BasicNodeData } from './utils'

export type NetworkOutputNodeData = Node<{ name: string } & BasicNodeData, 'net-output'>
export type NetworkOutputProps = {
    className?: string
} & NodeProps<NetworkOutputNodeData>

export const NodeNetworkOutput = (props: NetworkOutputProps) => {
    const { selected = false, className } = props
    const {} = props.data

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block contentClass="rounded-l-lg rounded-r-4xl">
                <NodeHandle type="target" />
                <div
                    className={cn(
                        'bg-primary/10 text-primary transition-colors',
                        'flex size-9 shrink-0 items-center justify-center rounded-full',
                    )}
                >
                    <div className="[&>svg]:size-5">
                        <EthernetPort />
                    </div>
                </div>
            </NodeLayout.Block>
            <NodeLayout.Popup title="Network Output Settings">
                <NodeLayout.Params disabled={true}>OK Param</NodeLayout.Params>
                <NodeLayout.Settings disabled={true}>OK Settings</NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

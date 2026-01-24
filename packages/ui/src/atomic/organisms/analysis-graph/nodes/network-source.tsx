import type { ReactNode, ComponentProps } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from './node-layout'

export type NetworkSourceNodeData = Node<{
    name: string
    icon: ReactNode
}>
export type NetworkSourceProps = {
    selected?: boolean
} & NodeProps<NetworkSourceNodeData> &
    ComponentProps<'div'>

export const NetworkSource = (props: NetworkSourceProps) => {
    const { selected = false, className, data, draggable, ...rest } = props
    const { name, icon } = data

    return (
        <NodeLayout
            name={name}
            selected={selected}
            className={className}
            contentClass="rounded-l-4xl rounded-r-lg"
            {...rest}
        >
            <div
                className={cn(
                    'bg-primary/10 text-primary transition-colors',
                    'flex size-9 shrink-0 items-center justify-center rounded-full',
                )}
            >
                <div className="[&>svg]:size-5">{icon}</div>
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
        </NodeLayout>
    )
}

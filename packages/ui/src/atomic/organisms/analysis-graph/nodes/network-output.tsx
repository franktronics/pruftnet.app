import { ReactNode, type ComponentProps } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from './node-layout'

export type NetworkOutputNodeData = Node<{
    name: string
    icon: ReactNode
}>
export type NetworkOutputProps = {} & NodeProps<NetworkOutputNodeData> & ComponentProps<'div'>

export const NetworkOutput = (props: NetworkOutputProps) => {
    const { selected = false, className, data, draggable, ...rest } = props
    const { name, icon } = data

    return (
        <NodeLayout
            name={name}
            selected={selected}
            className={className}
            contentClass="rounded-l-lg rounded-r-4xl"
            {...rest}
        >
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
        </NodeLayout>
    )
}

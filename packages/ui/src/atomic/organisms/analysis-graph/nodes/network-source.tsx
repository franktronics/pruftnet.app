import type { ReactNode, ComponentProps } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'

export type NetworkSourceNodeData = Node<{
    name: string
    icon: ReactNode
}>
export type NetworkSourceProps = {
    selected?: boolean
} & NodeProps<NetworkSourceNodeData> &
    ComponentProps<'div'>

export const NetworkSource = (props: NetworkSourceProps) => {
    const { selected = false, className, data, ...rest } = props
    const { name, icon } = data

    return (
        <div className={cn('relative flex flex-col items-center gap-2', className)} {...rest}>
            <div
                className={cn(
                    'relative border-2 p-3 transition-all',
                    'bg-background shadow-sm hover:shadow-md',
                    'flex items-center justify-center',
                    'rounded-l-4xl rounded-r-lg',
                    selected
                        ? 'border-primary ring-primary/20 ring-2'
                        : 'border-border hover:border-primary/50',
                )}
            >
                <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full transition-colors">
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
            </div>

            <span className="text-foreground text-xs font-medium">{name}</span>
        </div>
    )
}

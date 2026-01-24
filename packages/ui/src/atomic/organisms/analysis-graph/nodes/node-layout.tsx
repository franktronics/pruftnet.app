import { cn } from '@repo/utils'
import { NodeProps, NodeToolbar, Node } from '@xyflow/react'
import { type ComponentProps } from 'react'
import { Button } from '../../../atoms'
import { Ellipsis, Trash } from 'lucide-react'

export type NodeLayoutProps = {
    data: NodeProps<Node<{ name: string }>>
    selected?: boolean
    contentClass?: string
} & ComponentProps<'div'>

export const NodeLayout = (props: NodeLayoutProps) => {
    const {
        draggable,
        children,
        className,
        data,
        selected = false,
        contentClass = '',
        ref,
        ...rest
    } = props

    return (
        <div
            draggable="false"
            className={cn('relative flex flex-col items-center gap-1', className)}
            ref={ref}
            {...rest}
        >
            <NodeToolbar className="flex items-center gap-2">
                <Button variant="outline" size="icon">
                    <Trash className="size-4" />
                </Button>
                <Button variant="outline" size="icon">
                    <Ellipsis className="size-4" />
                </Button>
            </NodeToolbar>
            <div
                className={cn(
                    'relative flex flex-col gap-0 border-2 p-3 transition-all',
                    'bg-background rounded-lg',
                    selected
                        ? 'border-primary ring-primary/20 ring-2'
                        : 'border-border hover:border-primary/50',
                    contentClass,
                )}
            >
                {children}
            </div>
            <span className="text-foreground text-xs font-medium">{data.data.name}</span>
        </div>
    )
}

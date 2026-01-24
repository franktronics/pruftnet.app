import { cn } from '@repo/utils'
import { type ComponentProps } from 'react'

export type NodeLayoutProps = {
    name: string
    selected?: boolean
    contentClass?: string
} & ComponentProps<'div'>

export const NodeLayout = (props: NodeLayoutProps) => {
    const {
        draggable,
        children,
        className,
        name,
        selected = false,
        contentClass = '',
        ref,
        ...rest
    } = props
    return (
        <div
            draggable="false"
            className={cn('relative flex flex-col items-center gap-2', className)}
            ref={ref}
            {...rest}
        >
            <div
                className={cn(
                    'relative flex flex-col gap-0 border-2 p-3 transition-all',
                    'bg-background rounded-lg shadow-sm hover:shadow-md',
                    selected
                        ? 'border-primary ring-primary/20 ring-2'
                        : 'border-border hover:border-primary/50',
                    contentClass,
                )}
            >
                {children}
            </div>
            <span className="text-foreground text-xs font-medium">{name}</span>
        </div>
    )
}

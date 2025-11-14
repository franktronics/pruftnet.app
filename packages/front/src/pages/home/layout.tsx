import { cn } from '@repo/utils'
import type { ComponentPropsWithoutRef } from 'react'

export type LayoutProps = {} & ComponentPropsWithoutRef<'div'>
export const Layout = (props: LayoutProps) => {
    const { children, className, ...rest } = props

    return (
        <div className={cn('flex h-full flex-col p-2', className)} {...rest}>
            {children}
        </div>
    )
}

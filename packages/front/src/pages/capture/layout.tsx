import { cn } from '@repo/utils'
import type { ComponentPropsWithoutRef } from 'react'
import { ScanControlProvider } from './context/scan-control-context'

export type LayoutProps = {} & ComponentPropsWithoutRef<'div'>
export const Layout = (props: LayoutProps) => {
    const { children, className, ...rest } = props

    return (
        <ScanControlProvider>
            <div className={cn('flex h-full min-h-0 flex-col p-2', className)} {...rest}>
                {children}
            </div>
        </ScanControlProvider>
    )
}

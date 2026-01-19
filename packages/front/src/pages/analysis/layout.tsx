import { cn } from '@repo/utils'
import { Outlet } from '@tanstack/react-router'

export const Layout = () => {
    return (
        <div className={cn('flex h-full flex-col p-2')}>
            <Outlet />
        </div>
    )
}

import { cn } from '@repo/utils'
import { Outlet } from '@tanstack/react-router'

export const Layout = () => {
    return (
        <div className={cn('h-full')}>
            <Outlet />
        </div>
    )
}

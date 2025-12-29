import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { cn } from '@repo/utils'
import { Separator } from '@repo/ui/atoms'

type SettingsNavItem = {
    title: string
    href: string
}

const settingsNav: SettingsNavItem[] = [
    {
        title: 'General',
        href: '/settings/general',
    },
    {
        title: 'Capture',
        href: '/settings/capture',
    },
]

export function SettingsLayout() {
    const routerState = useRouterState()
    const pathname = routerState.location.pathname

    return (
        <div className="flex min-h-screen flex-col">
            <div className="flex-1 p-6 pb-16 md:p-10">
                <div className="mx-auto max-w-5xl space-y-6">
                    <div className="space-y-0.5">
                        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                        <p className="text-muted-foreground">
                            Manage your application settings and preferences.
                        </p>
                    </div>
                    <Separator className="my-6" />
                    <div
                        className={cn(
                            'relative flex flex-col space-y-8',
                            'lg:flex-row lg:gap-12 lg:space-y-0',
                        )}
                    >
                        <aside className="lg:mx-0 lg:w-48 lg:shrink-0">
                            <nav className="flex space-x-2 lg:flex-col lg:space-y-1 lg:space-x-0">
                                {settingsNav.map((item) => (
                                    <Link
                                        key={item.href}
                                        to={item.href}
                                        className={cn(
                                            'rounded-md px-4 py-2 text-sm font-medium',
                                            'inline-flex items-center whitespace-nowrap',
                                            'hover:bg-muted hover:text-foreground transition-colors',
                                            'disabled:pointer-events-none disabled:opacity-50',
                                            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                                            pathname === item.href
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground',
                                        )}
                                    >
                                        {item.title}
                                    </Link>
                                ))}
                            </nav>
                        </aside>
                        <div className="flex-1">
                            <Outlet />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

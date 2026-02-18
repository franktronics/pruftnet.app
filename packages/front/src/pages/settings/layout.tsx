import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { cn } from '@repo/utils'
import { Button, Separator } from '@repo/ui/atoms'
import { useSettingsContext } from './context/settings-context'

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
    const { form, resetAppSettings, isPending } = useSettingsContext()

    return (
        <div
            className={cn(
                'mx-auto h-full max-w-5xl',
                'p-4 lg:pt-6',
                'grid grid-rows-[auto_1fr_auto]',
            )}
        >
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
                <p className="text-muted-foreground">
                    Manage your application settings and preferences.
                </p>
                <Separator className="my-6" />
            </div>
            <div
                className={cn(
                    'relative flex flex-col',
                    'lg:flex-row lg:gap-12 lg:space-y-0',
                    'overflow-y-hidden',
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
                <div className="scrollbar-thin flex-1 overflow-y-auto">
                    <Outlet />
                </div>
            </div>
            <div>
                <Separator className="my-6" />
                <aside className="flex flex-wrap items-center justify-between gap-4">
                    <form.Subscribe
                        selector={(state) => [state.canSubmit, state.isSubmitting]}
                        children={([canSubmit, isSubmitting]) => (
                            <>
                                <div>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={isPending || isSubmitting || !canSubmit}
                                        onClick={async () => {
                                            await resetAppSettings()
                                        }}
                                    >
                                        Reset to Defaults
                                    </Button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isPending}
                                        onClick={() => {
                                            form.reset()
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="default"
                                        disabled={isPending || isSubmitting || !canSubmit}
                                        onClick={form.handleSubmit}
                                    >
                                        Save Changes
                                    </Button>
                                </div>
                            </>
                        )}
                    />
                </aside>
            </div>
        </div>
    )
}

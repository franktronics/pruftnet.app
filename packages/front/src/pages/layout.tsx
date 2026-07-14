import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { History, Radar, Settings } from 'lucide-react'
import { useState, type ComponentProps } from 'react'

import { Button, Separator } from '@repo/ui/atoms'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from '@repo/ui/organisms'

import pruftnetIcon from '#front/assets/pruftnet-icon.png'
import { ThemeToggle } from '#front/theme/theme-toggle'
import { cn } from '@repo/utils'
import { DesktopTitlebarTarget } from '#front/components/desktop-titlebar-context'
import { CaptureTitlebarActions } from '#front/pages/capture/components/capture-titlebar-actions'

const mainNavigation = [
    {
        title: 'Capture',
        to: '/',
        icon: Radar,
    },
    {
        title: 'History',
        to: '/captures',
        icon: History,
    },
] as const

const footerNavigation = [
    {
        title: 'Settings',
        to: '/settings',
        icon: Settings,
    },
] as const

function isActiveRoute(pathname: string, to: string) {
    return to === '/'
        ? pathname === '/' || pathname.startsWith('/capture/')
        : pathname.startsWith(to)
}

export function DashboardLayout() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    })
    const isDesktop = typeof window !== 'undefined' && Boolean(window.pruftnet)
    const desktopPlatform = isDesktop ? window.pruftnet?.platform : undefined
    const isCaptureWorkspace = pathname === '/' || pathname.startsWith('/capture/')
    const [titlebarTarget, setTitlebarTarget] = useState<HTMLDivElement | null>(null)

    return (
        <SidebarProvider className={isDesktop ? 'flex-col' : undefined}>
            <DesktopTitlebarTarget.Provider value={titlebarTarget}>
                {isDesktop && (
                    <DesktopTitleBar pathname={pathname} captureControlsRef={setTitlebarTarget} />
                )}
                <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
                    <AppSidebar
                        pathname={pathname}
                        isDesktop={isDesktop}
                        desktopPlatform={desktopPlatform}
                    />
                    <SidebarInset className="min-h-0 w-auto min-w-0 overflow-hidden">
                        {!isDesktop && <WebHeader pathname={pathname} />}
                        <main
                            className={cn(
                                'flex min-h-0 min-w-0 flex-1 flex-col',
                                isCaptureWorkspace ? 'overflow-hidden' : 'gap-4 p-4 pt-0',
                            )}
                        >
                            <Outlet />
                        </main>
                    </SidebarInset>
                </div>
            </DesktopTitlebarTarget.Provider>
        </SidebarProvider>
    )
}

function DesktopTitleBar({
    pathname,
    captureControlsRef,
}: {
    pathname: string
    captureControlsRef: (element: HTMLDivElement | null) => void
}) {
    const { state } = useSidebar()
    const desktopPlatform = typeof window === 'undefined' ? undefined : window.pruftnet?.platform

    return (
        <header
            className={cn(
                'desktop-titlebar drag-region relative flex shrink-0 items-center p-0',
                desktopPlatform === 'darwin' ? 'desktop-titlebar--vibrant' : 'bg-background/95',
            )}
            data-desktop-platform={desktopPlatform}
            data-sidebar-state={state}
        >
            <div
                className={cn(
                    'desktop-titlebar-sidebar-boundary h-full shrink-0',
                    desktopPlatform === 'darwin' && 'desktop-titlebar-sidebar-boundary--vibrant',
                )}
            />
            <div className="desktop-titlebar-brand pointer-events-none absolute z-10 flex items-center gap-2 overflow-hidden">
                <img src={pruftnetIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
                <span className="desktop-titlebar-brand-text text-sidebar-foreground text-sm font-medium tracking-tight">
                    Pruftnet
                </span>
            </div>
            <SidebarTrigger
                variant="ghost"
                className="desktop-titlebar-trigger no-drag-region absolute z-10 active:translate-y-0"
            />

            <div
                ref={captureControlsRef}
                id="desktop-titlebar-capture-controls"
                className="flex min-w-0 flex-1 items-center px-3"
            />
            <div
                className={cn('desktop-titlebar-actions no-drag-region', 'flex items-center gap-8')}
            >
                <CaptureTitlebarActions pathname={pathname} />

                <div className="flex items-center gap-1">
                    <SettingsButton />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    )
}

function WebHeader({ pathname }: { readonly pathname: string }) {
    return (
        <header className="flex h-10 shrink-0 items-center gap-2 border-b">
            <div className="flex flex-1 items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="my-1.5 mr-2" />
                <span className="text-sm font-medium tracking-tight">Pruftnet</span>
                <div className="ml-auto flex items-center gap-8">
                    <CaptureTitlebarActions pathname={pathname} compact />

                    <div className="flex items-center gap-1">
                        <SettingsButton />
                        <ThemeToggle />
                    </div>
                </div>
            </div>
        </header>
    )
}

function SettingsButton() {
    return (
        <Button
            variant="outline"
            size="icon"
            aria-label="Open settings"
            nativeButton={false}
            render={<Link to="/settings" />}
        >
            <Settings />
        </Button>
    )
}

function AppSidebar({
    className,
    desktopPlatform,
    isDesktop,
    pathname,
    style,
    ...props
}: ComponentProps<typeof Sidebar> & {
    readonly isDesktop: boolean
    readonly desktopPlatform: string | undefined
    readonly pathname: string
}) {
    const desktopSidebarClassName = 'desktop-sidebar'
    const sidebarAppearanceClassName =
        desktopPlatform === 'darwin' ? 'desktop-sidebar--vibrant' : undefined

    return (
        <Sidebar
            collapsible="offcanvas"
            variant="sidebar"
            className={
                isDesktop
                    ? [desktopSidebarClassName, sidebarAppearanceClassName, className]
                          .filter(Boolean)
                          .join(' ')
                    : className
            }
            style={
                isDesktop
                    ? {
                          ...style,
                          top: 'var(--desktop-titlebar-height)',
                          bottom: 'auto',
                          height: 'calc(100svh - var(--desktop-titlebar-height))',
                      }
                    : style
            }
            {...props}
        >
            <SidebarContent>
                <SidebarGroup className="pt-2">
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainNavigation.map((item) => {
                                const Icon = item.icon

                                return (
                                    <SidebarMenuItem key={item.to}>
                                        <SidebarMenuButton
                                            tooltip={item.title}
                                            isActive={isActiveRoute(pathname, item.to)}
                                            render={<Link to={item.to} />}
                                        >
                                            <Icon />
                                            <span>{item.title}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
                <SidebarMenu>
                    {footerNavigation.map((item) => {
                        const Icon = item.icon

                        return (
                            <SidebarMenuItem key={item.to}>
                                <SidebarMenuButton
                                    tooltip={item.title}
                                    isActive={isActiveRoute(pathname, item.to)}
                                    render={<Link to={item.to} />}
                                >
                                    <Icon />
                                    <span>{item.title}</span>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        )
                    })}
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}

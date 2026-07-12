import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { Settings, Files } from 'lucide-react'
import type { ComponentProps } from 'react'

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
    SidebarRail,
    SidebarTrigger,
    useSidebar,
} from '@repo/ui/organisms'

import pruftnetIcon from '../assets/pruftnet-icon.png'
import { ThemeToggle } from '../theme/theme-toggle'
import { cn } from '@repo/utils'

const mainNavigation = [
    {
        title: 'Captures',
        to: '/',
        icon: Files,
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
    return to === '/' ? pathname === '/' : pathname.startsWith(to)
}

export function DashboardLayout() {
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    })
    const isDesktop = typeof window !== 'undefined' && Boolean(window.pruftnet)
    const isCapture = pathname.startsWith('/capture/')

    return (
        <SidebarProvider className={isDesktop ? 'flex-col' : undefined}>
            {isDesktop && <DesktopTitleBar />}
            <div className="flex min-h-0 flex-1">
                <AppSidebar pathname={pathname} isDesktop={isDesktop} />
                <SidebarInset className="min-h-0 overflow-hidden">
                    {!isDesktop && <WebHeader />}
                    <main
                        className={cn(
                            'flex min-h-0 flex-1 flex-col',
                            isCapture ? 'overflow-hidden' : 'gap-4 p-4 pt-0',
                        )}
                    >
                        <Outlet />
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    )
}

function DesktopTitleBar() {
    const { state } = useSidebar()
    const desktopPlatform = typeof window === 'undefined' ? undefined : window.pruftnet?.platform

    return (
        <header
            className="desktop-titlebar drag-region bg-background/95 relative flex shrink-0 items-center p-0"
            data-desktop-platform={desktopPlatform}
            data-sidebar-state={state}
        >
            <div
                className={cn(
                    'desktop-titlebar-sidebar-boundary h-full shrink-0 border-r',
                    'border-border dark:border-border/50',
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

            <div className="min-w-0 flex-1" />
            <div className="desktop-titlebar-actions no-drag-region flex items-center gap-1 px-3">
                <SettingsButton />
                <ThemeToggle />
            </div>
        </header>
    )
}

function WebHeader() {
    return (
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex flex-1 items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="my-1.5 mr-2" />
                <span className="text-sm font-medium tracking-tight">Pruftnet</span>
                <div className="ml-auto flex items-center gap-1">
                    <SettingsButton />
                    <ThemeToggle />
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
    isDesktop,
    pathname,
    ...props
}: ComponentProps<typeof Sidebar> & {
    readonly isDesktop: boolean
    readonly pathname: string
}) {
    const desktopSidebarClassName =
        '[top:var(--desktop-titlebar-height)] [bottom:auto] [height:calc(100svh_-_var(--desktop-titlebar-height))]'

    return (
        <Sidebar
            collapsible="icon"
            variant="sidebar"
            className={
                isDesktop
                    ? [desktopSidebarClassName, className].filter(Boolean).join(' ')
                    : className
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
            <SidebarRail />
        </Sidebar>
    )
}

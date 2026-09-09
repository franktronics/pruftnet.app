import { Link, Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ArrowLeft, History, Radar, Settings } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button, Separator } from '@repo/ui/atoms'
import { Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui/molecules'
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
import { useRegisterApplicationCommand } from '#front/commands/application-command-provider'
import { requestCaptureSettings } from '#front/commands/capture-settings-request'
import { activeCaptureOptions } from '#front/pages/capture/api/capture-queries'

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

function pageTitle(pathname: string) {
    if (pathname.startsWith('/settings')) return 'Settings'
    if (pathname.startsWith('/captures')) return 'History'
    return undefined
}

function TitlebarPageTitle({ pathname }: { readonly pathname: string }) {
    const router = useRouter()
    const navigate = useNavigate()
    const title = pageTitle(pathname)
    if (!title) return null

    return (
        <div className="no-drag-region flex shrink-0 items-center gap-1">
            <Tooltip>
                <TooltipTrigger
                    render={
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Go back"
                            onClick={() => {
                                if (router.history.canGoBack()) router.history.back()
                                else void navigate({ to: '/' })
                            }}
                        >
                            <ArrowLeft />
                        </Button>
                    }
                />
                <TooltipContent>Back</TooltipContent>
            </Tooltip>
            <span className="text-sm font-semibold tracking-tight">{title}</span>
        </div>
    )
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
                <LayoutApplicationCommands pathname={pathname} />
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

function LayoutApplicationCommands({ pathname }: { readonly pathname: string }) {
    const router = useRouter()
    const navigate = useNavigate()
    const { toggleSidebar } = useSidebar()
    const active = useQuery(activeCaptureOptions())
    const activeCaptureId = active.data?.captureId
    const captureWorkspace = pathname === '/' || pathname.startsWith('/capture/')

    useRegisterApplicationCommand('new-capture', {
        enabled: !activeCaptureId,
        disabledReason: activeCaptureId ? 'Stop the active capture first.' : undefined,
        execute: () => navigate({ to: '/' }),
    })
    useRegisterApplicationCommand('capture-workspace', {
        enabled: true,
        execute: () =>
            activeCaptureId
                ? navigate({ to: '/capture/$captureId', params: { captureId: activeCaptureId } })
                : navigate({ to: '/' }),
    })
    useRegisterApplicationCommand('active-capture', {
        enabled: Boolean(activeCaptureId),
        disabledReason: active.isPending
            ? 'Checking for an active capture…'
            : 'No capture is active.',
        execute: () =>
            activeCaptureId
                ? navigate({ to: '/capture/$captureId', params: { captureId: activeCaptureId } })
                : undefined,
    })
    useRegisterApplicationCommand('history', {
        enabled: pathname !== '/captures',
        disabledReason: pathname === '/captures' ? 'History is already open.' : undefined,
        execute: () => navigate({ to: '/captures' }),
    })
    useRegisterApplicationCommand('settings', {
        enabled: pathname !== '/settings',
        disabledReason: pathname === '/settings' ? 'Settings are already open.' : undefined,
        execute: () => navigate({ to: '/settings' }),
    })
    useRegisterApplicationCommand('keyboard-shortcuts', {
        enabled: true,
        execute: async () => {
            await navigate({ to: '/settings', hash: 'keyboard' })
            requestAnimationFrame(() => {
                const target = document.getElementById('keyboard')
                target?.scrollIntoView({ block: 'start' })
                target?.focus({ preventScroll: true })
            })
        },
    })
    useRegisterApplicationCommand('back', {
        enabled: router.history.canGoBack(),
        disabledReason: 'There is no previous location.',
        execute: () => router.history.back(),
    })
    useRegisterApplicationCommand('toggle-sidebar', {
        enabled: true,
        execute: toggleSidebar,
    })
    useRegisterApplicationCommand('capture-settings', {
        enabled: true,
        execute: async () => {
            requestCaptureSettings()
            if (!captureWorkspace) {
                await (activeCaptureId
                    ? navigate({
                          to: '/capture/$captureId',
                          params: { captureId: activeCaptureId },
                      })
                    : navigate({ to: '/' }))
            }
        },
    })

    return null
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
            <Tooltip>
                <TooltipTrigger
                    render={
                        <SidebarTrigger
                            variant="ghost"
                            className="desktop-titlebar-trigger no-drag-region absolute z-10 active:translate-y-0"
                        />
                    }
                />
                <TooltipContent>Toggle sidebar</TooltipContent>
            </Tooltip>

            <div
                ref={captureControlsRef}
                id="desktop-titlebar-capture-controls"
                className="flex min-w-0 flex-1 items-center gap-2 px-3"
            >
                <TitlebarPageTitle pathname={pathname} />
            </div>
            <div
                className={cn('desktop-titlebar-actions no-drag-region', 'flex items-center gap-2')}
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
                <TitlebarPageTitle pathname={pathname} />
                <div className="ml-auto flex items-center gap-2">
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
        <Tooltip>
            <TooltipTrigger
                render={
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Open settings"
                        nativeButton={false}
                        render={<Link to="/settings" />}
                    >
                        <Settings />
                    </Button>
                }
            />
            <TooltipContent>Settings</TooltipContent>
        </Tooltip>
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

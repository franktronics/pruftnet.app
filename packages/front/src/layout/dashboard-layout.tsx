import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { GearIcon, HouseIcon } from "@phosphor-icons/react"
import type { ComponentProps } from "react"

import { Button, Separator } from "@repo/ui/atoms"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@repo/ui/organisms"

import { ThemeToggle } from "../theme/theme-toggle"

const mainNavigation = [
  {
    title: "Home",
    to: "/",
    icon: HouseIcon,
  },
] as const

const footerNavigation = [
  {
    title: "Settings",
    to: "/settings",
    icon: GearIcon,
  },
] as const

function isActiveRoute(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to)
}

export function DashboardLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const isDesktop = typeof window !== "undefined" && Boolean(window.pruftnet)

  return (
    <SidebarProvider className={isDesktop ? "flex-col" : undefined}>
      {isDesktop && <DesktopTitleBar />}
      <div className="flex min-h-0 flex-1">
        <AppSidebar pathname={pathname} isDesktop={isDesktop} />
        <SidebarInset>
          {!isDesktop && <WebHeader />}
          <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

function DesktopTitleBar() {
  return (
    <header className="desktop-titlebar drag-region flex shrink-0 items-center border-b bg-background/95 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="no-drag-region" />
        <span className="truncate text-sm font-medium tracking-tight">Pruftnet</span>
      </div>
      <div className="no-drag-region flex items-center gap-1">
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
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
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
      variant="ghost"
      size="icon"
      aria-label="Open settings"
      render={<Link to="/settings" />}
    >
      <GearIcon />
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
    "[top:var(--desktop-titlebar-height)] [bottom:auto] [height:calc(100svh_-_var(--desktop-titlebar-height))]"

  return (
    <Sidebar
      collapsible="icon"
      variant="floating"
      className={
        isDesktop
          ? [desktopSidebarClassName, className].filter(Boolean).join(" ")
          : className
      }
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                P
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Pruftnet</span>
                <span className="truncate text-xs">Dashboard</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
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

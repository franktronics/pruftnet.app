import { Waypoints, type LucideIcon } from 'lucide-react'
import { NavMain } from './nav-main'
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarRail,
} from '../../organisms'
import { type ComponentProps } from 'react'
import { NavSecondary } from './nav-secondary'

export type SidebarConfigType = {
    navMain: {
        title: string
        url: string
        icon?: LucideIcon
        isActive?: boolean
        items?: {
            title: string
            url: string
        }[]
    }[]
    navSecondary: {
        title: string
        url: string
        icon: LucideIcon
    }[]
}

export function AppSidebar({
    config,
    ...props
}: { config: SidebarConfigType } & ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar variant="sidebar" collapsible="icon" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="data-[slot=sidebar-menu-button]:p-1.5!"
                        >
                            <a href="#">
                                <Waypoints className="size-6!" />
                                <span className="text-base font-semibold">Pruftnet</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={config.navMain} />
                <NavSecondary items={config.navSecondary} className="mt-auto" />
            </SidebarContent>
            <SidebarFooter></SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

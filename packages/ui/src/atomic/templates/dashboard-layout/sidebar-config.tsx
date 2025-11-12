import { GalleryVerticalEnd, Settings2, Database, ShoppingCart, Radar } from 'lucide-react'

import { NavMain } from './nav-main'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail } from '../../organisms'
import { type ComponentProps } from 'react'

const data = {
    user: {
        name: 'franktronics',
        email: 'm@example.com',
        avatar: '/avatars/shadcn.jpg',
    },
    teams: [
        {
            name: 'Pruftnet',
            logo: GalleryVerticalEnd,
            plan: 'Session',
        },
    ],
    navMain: [
        {
            title: 'Scan',
            url: '/',
            icon: Radar,
            isActive: true,
            items: [],
        },
        {
            title: 'Analyze',
            url: '/analyze',
            icon: Database,
            isActive: true,
            items: [],
        },
        {
            title: 'Settings',
            url: '#',
            icon: Settings2,
            items: [
                {
                    title: 'General',
                    url: '#',
                },
                {
                    title: 'Exports',
                    url: '#',
                },
                {
                    title: 'Advanced',
                    url: '#',
                },
            ],
        },
    ],
}

export function AppSidebar({ ...props }: ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar variant="sidebar" collapsible="icon" {...props}>
            <SidebarHeader>
                <TeamSwitcher teams={data.teams} />
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={data.navMain} />
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={data.user} />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    )
}

import { Database, Radar, Settings, Info, LifeBuoy } from 'lucide-react'

export const SidebarConfig = {
    navMain: [
        {
            title: 'Capture',
            url: '/',
            icon: Radar,
            isActive: true,
            items: [],
        },
        {
            title: 'Analysis',
            url: '/analysis',
            icon: Database,
            isActive: true,
            items: [],
        },
    ],
    navSecondary: [
        {
            title: 'Settings',
            url: '/settings',
            icon: Settings,
        },
        {
            title: 'Support',
            url: '/support',
            icon: LifeBuoy,
        },
        {
            title: 'About',
            url: '/about',
            icon: Info,
        },
    ],
}

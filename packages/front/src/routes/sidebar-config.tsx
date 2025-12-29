import { Database, Radar, Settings, Info, LifeBuoy } from 'lucide-react'

export const SidebarConfig = {
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

import { Database, Radar, Settings, Info, LifeBuoy, Binoculars } from 'lucide-react'

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
        {
            title: 'Monitoring',
            url: '/monitoring',
            icon: Binoculars,
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

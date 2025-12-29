import { Database, Radar, Settings, HelpCircle, Info } from 'lucide-react'

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
            url: '#',
            icon: Settings,
        },
        {
            title: 'Get Help',
            url: '#',
            icon: HelpCircle,
        },
        {
            title: 'Search',
            url: '#',
            icon: Info,
        },
    ],
}

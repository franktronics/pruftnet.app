import {
    Outlet,
    createRoute,
    createRootRoute,
    createRouter,
    useRouterState,
} from '@tanstack/react-router'
import Error404 from '../pages/error/404'
import Capture from '../pages/capture'
import { DashboardLayout, type BreadcrumbItem } from '@repo/ui/templates'
import { SidebarConfig } from './sidebar-config'
import { useMemo } from 'react'
import { createSettingsRoutes } from '../pages/settings/routes'
import { createAnalysisRoutes } from '../pages/analysis/routes'
import { createMonitoringRoutes } from '../pages/monitoring/routes'

function RootComponent() {
    const routerState = useRouterState()
    const pathname = routerState.location.pathname

    const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
        const allItems = [...SidebarConfig.navMain, ...SidebarConfig.navSecondary]
        const matchedItem = allItems.find((item) => item.url === pathname)

        const baseBreadcrumb: BreadcrumbItem = { title: 'Application', href: '/' }

        if (matchedItem) {
            return [baseBreadcrumb, { title: matchedItem.title }]
        }

        if (pathname === '/') {
            return [baseBreadcrumb, { title: 'Scan' }]
        }

        const segments = pathname.split('/').filter(Boolean)
        const pathBreadcrumbs = segments.map((segment, index) => {
            const path = '/' + segments.slice(0, index + 1).join('/')
            const matchedSegmentItem = allItems.find((item) => item.url === path)

            return {
                title:
                    matchedSegmentItem?.title || segment.charAt(0).toUpperCase() + segment.slice(1),
                href: index < segments.length - 1 ? path : undefined,
            }
        })

        return [baseBreadcrumb, ...pathBreadcrumbs]
    }, [pathname])

    return (
        <DashboardLayout sidebarConfig={SidebarConfig} breadcrumbs={breadcrumbs}>
            <Outlet />
        </DashboardLayout>
    )
}

export const rootRoute = createRootRoute({
    component: RootComponent,
    notFoundComponent: Error404,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Capture,
})

const settingsRouteTree = createSettingsRoutes(rootRoute)
const analysisRouteTree = createAnalysisRoutes(rootRoute)
const monitoringRouteTree = createMonitoringRoutes(rootRoute)

const routeTree = rootRoute.addChildren([
    indexRoute,
    settingsRouteTree,
    analysisRouteTree,
    monitoringRouteTree,
])
export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

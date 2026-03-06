import { createRoute, type AnyRootRoute } from '@tanstack/react-router'
import { Layout } from './layout'
import Monitoring from './index'

export function createMonitoringRoutes(rootRoute: AnyRootRoute) {
    const monitoringLayoutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'monitoring',
        component: Layout,
    })

    const monitoringIndexRoute = createRoute({
        getParentRoute: () => monitoringLayoutRoute,
        path: '/',
        component: Monitoring,
    })

    return monitoringLayoutRoute.addChildren([monitoringIndexRoute])
}

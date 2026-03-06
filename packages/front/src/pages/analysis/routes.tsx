import { createRoute, type AnyRootRoute } from '@tanstack/react-router'
import { Layout } from './layout'
import Analysis from './index'

export function createAnalysisRoutes(rootRoute: AnyRootRoute) {
    const analysisLayoutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'analysis',
        component: Layout,
    })

    const analysisIndexRoute = createRoute({
        getParentRoute: () => analysisLayoutRoute,
        path: '/',
        component: Analysis,
    })

    return analysisLayoutRoute.addChildren([analysisIndexRoute])
}

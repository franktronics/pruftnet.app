import {
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
} from '@tanstack/react-router'

import { HomePage } from './home/home-page'
import { SettingsPage } from './settings/settings-page'
import { DashboardLayout } from './layout'
import { CapturesPage } from './captures/captures-page'

const rootRoute = createRootRoute({
    component: DashboardLayout,
})

const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
})

const capturesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/captures',
    component: CapturesPage,
})

const captureRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/capture/$captureId',
    component: lazyRouteComponent(() => import('./capture/capture-page'), 'CapturePage'),
})

const routeTree = rootRoute.addChildren([homeRoute, capturesRoute, settingsRoute, captureRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

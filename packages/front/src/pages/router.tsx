import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import { HomePage } from './home/home-page'
import { SettingsPage } from './settings/settings-page'
import { DashboardLayout } from './layout'

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

const routeTree = rootRoute.addChildren([homeRoute, settingsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

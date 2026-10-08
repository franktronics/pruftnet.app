import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
} from '@tanstack/react-router'

import { HomePage } from './home/home-page'
import { DashboardLayout } from './layout'

// Only the start page is in the startup bundle; other pages load on first navigation.
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
    component: lazyRouteComponent(() => import('./settings/settings-page'), 'SettingsPage'),
})

const capturesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/captures',
    component: lazyRouteComponent(() => import('./captures/captures-page'), 'CapturesPage'),
})

const captureRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/capture/$captureId',
    component: lazyRouteComponent(() => import('./capture/capture-page'), 'CapturePage'),
})

const routeTree = rootRoute.addChildren([homeRoute, capturesRoute, settingsRoute, captureRoute])

// Packaged desktop builds load the renderer from a custom scheme, where the URL path is the bundle
// location rather than an application route. Memory history also leaves the URL hash free for
// in-page anchors such as the settings sections.
const history =
    window.location.protocol !== 'http:' && window.location.protocol !== 'https:'
        ? createMemoryHistory({ initialEntries: ['/'] })
        : undefined

export const router = createRouter({ routeTree, ...(history ? { history } : {}) })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

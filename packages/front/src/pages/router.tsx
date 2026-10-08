import {
    createMemoryHistory,
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

// Packaged desktop builds load the renderer from file://, where the URL path is the bundle
// location rather than an application route. Memory history also leaves the URL hash free for
// in-page anchors such as the settings sections.
const history =
    window.location.protocol === 'file:'
        ? createMemoryHistory({ initialEntries: ['/'] })
        : undefined

export const router = createRouter({ routeTree, ...(history ? { history } : {}) })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

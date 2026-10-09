import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    lazyRouteComponent,
    redirect,
} from '@tanstack/react-router'

import { HomePage } from './home/home-page'
import { DashboardLayout } from './layout'
import { defaultSettingsSection, findSettingsSection } from './settings/settings-sections'

// Only the start page is in the startup bundle; other pages load on first navigation.
const rootRoute = createRootRoute({
    component: DashboardLayout,
})

const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: HomePage,
})

const settingsIndexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    beforeLoad: () => {
        throw redirect({ to: '/settings/$section', params: { section: defaultSettingsSection } })
    },
})

const settingsSectionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings/$section',
    beforeLoad: ({ params }) => {
        if (!findSettingsSection(params.section)) {
            throw redirect({
                to: '/settings/$section',
                params: { section: defaultSettingsSection },
            })
        }
    },
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

const routeTree = rootRoute.addChildren([
    homeRoute,
    capturesRoute,
    settingsIndexRoute,
    settingsSectionRoute,
    captureRoute,
])

// Packaged desktop builds load the renderer from a custom scheme, where the URL path is the bundle
// location rather than an application route.
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

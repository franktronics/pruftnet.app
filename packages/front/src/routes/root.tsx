import { Outlet, createRoute, createRootRoute, createRouter } from '@tanstack/react-router'
import Home from '../pages/home'
import Settings from '../pages/settings'
import Error404 from '../pages/error/404'
import { DashboardLayout } from '@repo/ui/templates'
import { SidebarConfig } from './sidebar-config'

const rootRoute = createRootRoute({
    component: () => (
        <>
            <DashboardLayout sidebarConfig={SidebarConfig}>
                <Outlet />
            </DashboardLayout>
        </>
    ),
    notFoundComponent: Error404,
})

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Home,
})

const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: Settings,
})

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute])
export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

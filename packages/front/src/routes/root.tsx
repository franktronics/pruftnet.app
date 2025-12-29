import { Outlet, createRoute, createRootRoute, createRouter } from '@tanstack/react-router'
import Home from '../pages/home'
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

const routeTree = rootRoute.addChildren([indexRoute])
export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

import { createRoute, Navigate, type AnyRootRoute } from '@tanstack/react-router'
import { SettingsLayout } from './layout'
import { GeneralSettings } from './general'
import { CaptureSettings } from './capture'

export function createSettingsRoutes(rootRoute: AnyRootRoute) {
    const settingsLayoutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: 'settings',
        component: SettingsLayout,
    })

    const settingsIndexRoute = createRoute({
        getParentRoute: () => settingsLayoutRoute,
        path: '/',
        component: () => <Navigate to="/settings/general" replace />,
    })

    const settingsGeneralRoute = createRoute({
        getParentRoute: () => settingsLayoutRoute,
        path: 'general',
        component: GeneralSettings,
    })

    const settingsAnalysisRoute = createRoute({
        getParentRoute: () => settingsLayoutRoute,
        path: 'capture',
        component: CaptureSettings,
    })

    return settingsLayoutRoute.addChildren([
        settingsIndexRoute,
        settingsGeneralRoute,
        settingsAnalysisRoute,
    ])
}

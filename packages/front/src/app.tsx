import { RouterProvider } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ThemeProvider } from './theme/theme-provider'
import { router } from './pages/router'
import './styles/main.css'
import { syncDocumentWindowControlsOverlayClass } from './config/window-controls-overlay'
import { queryClient } from './config/query-client'
import { ExportManagerProvider } from './pages/captures/export-manager'
import { ApplicationRealtimeProvider } from './realtime/application-realtime-provider'
import { useAppSettings } from './settings/app-settings-context'
import { AppSettingsProvider } from './settings/app-settings-provider'
import { ApplicationCommandProvider } from './commands/application-command-provider'
import './config/desktop-api'
import {
    packetSummaryCacheBytes,
    packetSummaryPageCache,
} from './pages/capture/model/packet-summary-cache'

function PacketSummaryCacheBudgetSync() {
    const { packetListCacheMiB } = useAppSettings()

    useEffect(() => {
        packetSummaryPageCache.setBudgetBytes(packetSummaryCacheBytes(packetListCacheMiB))
    }, [packetListCacheMiB])

    return null
}

export function App() {
    useEffect(() => {
        if (!window.pruftnet) {
            return
        }

        document.documentElement.dataset.desktopPlatform = window.pruftnet.platform
        return syncDocumentWindowControlsOverlayClass()
    }, [])

    return (
        <QueryClientProvider client={queryClient}>
            <AppSettingsProvider>
                <PacketSummaryCacheBudgetSync />
                <ApplicationRealtimeProvider>
                    <ThemeProvider>
                        <ApplicationCommandProvider>
                            <ExportManagerProvider>
                                <RouterProvider router={router} />
                            </ExportManagerProvider>
                        </ApplicationCommandProvider>
                    </ThemeProvider>
                </ApplicationRealtimeProvider>
            </AppSettingsProvider>
        </QueryClientProvider>
    )
}

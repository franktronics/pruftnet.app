import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'

import { ThemeProvider } from './theme/theme-provider'
import { router } from './pages/router'
import './styles/main.css'
import { syncDocumentWindowControlsOverlayClass } from './config/window-controls-overlay'

const queryClient = new QueryClient()

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
            <ThemeProvider>
                <RouterProvider router={router} />
            </ThemeProvider>
        </QueryClientProvider>
    )
}

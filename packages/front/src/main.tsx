import './styles/main.css'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './routes/root.tsx'
import { ThemeProvider, type Theme } from '@repo/ui/molecules'
import { Toaster } from '@repo/ui/atoms'
import { StrictMode } from 'react'
import { FetcherProvider } from '@repo/utils'
import { SettingsProvider } from './pages/settings/context/settings-context.tsx'
import { AppLoader } from './pages/loader/loader.tsx'

const handleChangeTheme = (theme: Theme) => {
    window.electron?.changeTheme(theme)
}

export const Main = () => {
    return (
        <StrictMode>
            <FetcherProvider>
                <SettingsProvider>
                    <ThemeProvider
                        onHandleChangeTheme={handleChangeTheme}
                        defaultTheme="dark"
                        storageKey="app-ui-theme"
                    >
                        <AppLoader>
                            <Toaster position="top-right" />
                            <RouterProvider router={router} />
                        </AppLoader>
                    </ThemeProvider>
                </SettingsProvider>
            </FetcherProvider>
        </StrictMode>
    )
}

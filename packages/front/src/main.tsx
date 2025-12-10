import './styles/main.css'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './routes/root.tsx'
import { ThemeProvider, type Theme } from '@repo/ui/molecules'
import { Toaster } from '@repo/ui/atoms'
import { StrictMode } from 'react'
import { FetcherProvider } from '@repo/utils'

const handleChangeTheme = (theme: Theme) => {
    window.electron?.changeTheme(theme)
}

export const Main = () => {
    return (
        <StrictMode>
            <FetcherProvider>
                <ThemeProvider
                    onHandleChangeTheme={handleChangeTheme}
                    defaultTheme="dark"
                    storageKey="app-ui-theme"
                >
                    <Toaster position="top-right" />
                    <RouterProvider router={router} />
                </ThemeProvider>
            </FetcherProvider>
        </StrictMode>
    )
}

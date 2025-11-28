import './styles/main.css'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './routes/root.tsx'
import { ThemeProvider, type Theme } from '@repo/ui/molecules'
import { StrictMode } from 'react'

const handleChangeTheme = (theme: Theme) => {
    window.electron.changeTheme(theme)
}

export const Main = () => {
    return (
        <StrictMode>
            <ThemeProvider
                onHandleChangeTheme={handleChangeTheme}
                defaultTheme="dark"
                storageKey="app-ui-theme"
            >
                <RouterProvider router={router} />
            </ThemeProvider>
        </StrictMode>
    )
}

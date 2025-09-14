import './styles/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '@/routes/root.tsx'
import { ThemeProvider } from '@repo/ui/molecules'

const handleChangeTheme = (theme: 'dark' | 'light' | 'system') => {
    window.electron.changeTheme(theme)
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider
            onHandleChangeTheme={handleChangeTheme}
            defaultTheme="dark"
            storageKey="app-ui-theme"
        >
            <RouterProvider router={router} />
        </ThemeProvider>
    </StrictMode>,
)

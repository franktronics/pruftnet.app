import './styles/main.css'
import { RouterProvider } from '@tanstack/react-router'
import { router } from '@/routes/root.tsx'
import { ThemeProvider } from '@repo/ui/molecules'

const handleChangeTheme = (theme: 'dark' | 'light' | 'system') => {
    window.electron.changeTheme(theme)
}

function Main() {
    return (
        <ThemeProvider
            onHandleChangeTheme={handleChangeTheme}
            defaultTheme="dark"
            storageKey="app-ui-theme"
        >
            <RouterProvider router={router} />
        </ThemeProvider>
    )
}

export default Main

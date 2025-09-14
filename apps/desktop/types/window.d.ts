declare global {
    interface Window {
        electron: {
            changeTheme: (theme: 'dark' | 'light' | 'system') => void
        }
    }
}

export {}

declare global {
    interface Window {
        electron: {
            changeTheme: (theme: 'dark' | 'light' | 'system') => void
            onUpdateCounter: (callback: (v: number) => void) => void
        }
    }
}

export {}

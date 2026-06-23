import { ipcMain, nativeTheme } from 'electron'

export type DesktopTheme = 'dark' | 'light' | 'system'

function isDesktopTheme(theme: string): theme is DesktopTheme {
    return theme === 'dark' || theme === 'light' || theme === 'system'
}

export function registerIpcHandlers() {
    ipcMain.handle('theme:set', (_event, theme: string) => {
        if (!isDesktopTheme(theme)) {
            throw new Error(`Unsupported theme: ${theme}`)
        }

        nativeTheme.themeSource = theme
        return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    })
}

import { BrowserWindow, ipcMain, nativeTheme } from 'electron'

import { getResolvedDesktopTheme, syncWindowTitleBarOverlay } from './window-appearance'

export type DesktopTheme = 'dark' | 'light' | 'system'

function isDesktopTheme(theme: string): theme is DesktopTheme {
    return theme === 'dark' || theme === 'light' || theme === 'system'
}

export function registerIpcHandlers() {
    nativeTheme.on('updated', () => {
        const resolvedTheme = getResolvedDesktopTheme(nativeTheme.shouldUseDarkColors)

        for (const window of BrowserWindow.getAllWindows()) {
            syncWindowTitleBarOverlay(window, resolvedTheme)
        }
    })

    ipcMain.handle('theme:set', (event, theme: string) => {
        if (!isDesktopTheme(theme)) {
            throw new Error(`Unsupported theme: ${theme}`)
        }

        nativeTheme.themeSource = theme
        const resolvedTheme = getResolvedDesktopTheme(nativeTheme.shouldUseDarkColors)

        const window = BrowserWindow.fromWebContents(event.sender)
        if (window) {
            syncWindowTitleBarOverlay(window, resolvedTheme)
        }

        return resolvedTheme
    })
}

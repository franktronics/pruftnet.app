import { BrowserWindow } from 'electron'

export type ResolvedDesktopTheme = 'dark' | 'light'

export function getResolvedDesktopTheme(usesDarkColors: boolean): ResolvedDesktopTheme {
    return usesDarkColors ? 'dark' : 'light'
}

export function getTitleBarOverlay(theme: ResolvedDesktopTheme) {
    return theme === 'dark'
        ? {
              color: '#1B1B1D',
              symbolColor: '#C7C7CC',
              height: 48,
          }
        : {
              color: '#F9F9F8',
              symbolColor: '#5C5C60',
              height: 48,
          }
}

export function syncWindowTitleBarOverlay(window: BrowserWindow, theme: ResolvedDesktopTheme) {
    if (process.platform === 'darwin') {
        return
    }

    window.setTitleBarOverlay(getTitleBarOverlay(theme))
}

import type { BrowserWindow, Event as ElectronEvent } from 'electron'

import { getDesktopDevServerUrl } from './runtime-config'

function isAllowedNavigation(navigationUrl: string) {
    const devServerUrl = getDesktopDevServerUrl()

    if (!devServerUrl) {
        return navigationUrl.startsWith('file://')
    }

    try {
        const url = new URL(navigationUrl)
        return url.origin === new URL(devServerUrl).origin
    } catch {
        return false
    }
}

export function protectWindowNavigation(window: BrowserWindow) {
    window.webContents.on('will-navigate', (event: ElectronEvent, navigationUrl: string) => {
        if (!isAllowedNavigation(navigationUrl)) {
            event.preventDefault()
        }
    })

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

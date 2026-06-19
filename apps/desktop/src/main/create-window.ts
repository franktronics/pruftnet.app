import { BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getDesktopDevServerUrl, getRendererDirectoryName } from './runtime-config.js'
import { protectWindowNavigation } from './window-navigation.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function getPreloadPath() {
    return join(currentDirectory, '../preload/preload.js')
}

function getWindowIconPath() {
    if (process.platform === 'darwin') {
        return undefined
    }

    return join(currentDirectory, '../../assets/icons/icon.png')
}

function getRendererPath() {
    return join(currentDirectory, `../renderer/${getRendererDirectoryName()}/index.html`)
}

export async function createMainWindow() {
    const devServerUrl = getDesktopDevServerUrl()

    const window = new BrowserWindow({
        width: 1600,
        height: 1100,
        minWidth: 960,
        minHeight: 640,
        title: 'Pruftnet',
        icon: getWindowIconPath(),
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#00000000',
            symbolColor: '#737373',
            height: 48,
        },
        trafficLightPosition: { x: 16, y: 15 },
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: getPreloadPath(),
            sandbox: false,
        },
    })

    protectWindowNavigation(window)

    if (devServerUrl) {
        await window.loadURL(devServerUrl)
    } else {
        await window.loadFile(getRendererPath())
    }

    return window
}

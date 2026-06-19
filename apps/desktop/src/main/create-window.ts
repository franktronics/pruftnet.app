import { BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    const rendererName =
        typeof MAIN_WINDOW_VITE_NAME === 'undefined' ? 'main_window' : MAIN_WINDOW_VITE_NAME

    return join(currentDirectory, `../renderer/${rendererName}/index.html`)
}

export async function createMainWindow() {
    const devServerUrl =
        typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined'
            ? undefined
            : MAIN_WINDOW_VITE_DEV_SERVER_URL

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

import { app } from 'electron'

const rendererDirectoryName = 'main_window'

export function getRendererDirectoryName() {
    return rendererDirectoryName
}

export function getDesktopDevServerUrl() {
    if (app.isPackaged) {
        return undefined
    }

    const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim()
    if (!devServerUrl) {
        return undefined
    }

    const parsedUrl = new URL(devServerUrl)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error(`VITE_DEV_SERVER_URL must be an HTTP(S) URL: ${devServerUrl}`)
    }

    return parsedUrl.toString()
}

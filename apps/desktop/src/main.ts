import { app, BrowserWindow } from 'electron'

import { createMainWindow } from './main/create-window.js'
import { registerIpcHandlers } from './main/ipc.js'

async function bootstrap() {
    await app.whenReady()

    registerIpcHandlers()
    await createMainWindow()

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createMainWindow()
        }
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

bootstrap().catch((error: unknown) => {
    console.error('Failed to start desktop app', error)
    app.quit()
})

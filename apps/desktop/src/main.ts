import { app, BrowserWindow } from 'electron'
import { Effect } from 'effect'

import { createMainWindow } from './main/create-window.js'
import { registerIpcHandlers } from './main/ipc.js'
import { startDesktopRpcServer } from './main/rpc-server.js'

async function bootstrap() {
    await app.whenReady()

    const rpcServer = await Effect.runPromise(startDesktopRpcServer)

    app.once('before-quit', () => {
        void Effect.runPromise(rpcServer.close)
    })

    registerIpcHandlers()
    await createMainWindow({ rpcUrl: rpcServer.rpcUrl })

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createMainWindow({ rpcUrl: rpcServer.rpcUrl })
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

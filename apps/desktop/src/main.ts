import { app, BrowserWindow, dialog } from 'electron'
import { Effect } from 'effect'
import { releaseAppId, releaseName } from '@repo/core'
import { join } from 'node:path'

import { createMainWindow } from './main/create-window'
import { installApplicationMenu } from './main/application-menu'
import { DesktopExportDestinations } from './main/export-destinations'
import { registerIpcHandlers } from './main/ipc'
import { registerRendererScheme, serveRenderer } from './main/renderer-protocol'
import { getDesktopDevServerUrl } from './main/runtime-config'
import { startDesktopRpcServer } from './main/rpc-server'
import { elapsedSinceProcessStart, rendererStartupTimings } from './main/startup-timing'

async function bootstrap() {
    const smoke = process.argv.includes('--smoke-test')
    if (smoke) console.log('Smoke: bootstrap')
    app.setName(releaseName)
    // Matches the installer shortcuts so taskbar pins and notifications stay per channel.
    if (process.platform === 'win32') app.setAppUserModelId(releaseAppId)
    if (app.isPackaged) {
        app.setPath('userData', join(app.getPath('appData'), releaseName, 'electron'))
    }
    registerRendererScheme()
    await app.whenReady()
    const electronReadyMs = elapsedSinceProcessStart()
    if (smoke) console.log('Smoke: Electron ready')
    if (!getDesktopDevServerUrl()) serveRenderer()

    const exportDestinations = new DesktopExportDestinations()
    const rpcServer = await Effect.runPromise(startDesktopRpcServer(exportDestinations))
    // The backend builds while the renderer loads; the window must not wait for it.
    const backendReady = Effect.runPromise(rpcServer.ready).then(elapsedSinceProcessStart)
    // Awaited below; this only keeps a failure during the window load from being unhandled.
    backendReady.catch(() => undefined)

    registerIpcHandlers(exportDestinations)
    installApplicationMenu()
    let mainWindow = await createMainWindow({ rpcUrl: rpcServer.rpcUrl })
    if (smoke) {
        const windowLoadedMs = elapsedSinceProcessStart()
        console.log('Smoke: renderer loaded')
        const backendReadyMs = await backendReady
        console.log('Smoke: backend ready')
        const startup = {
            electronReadyMs,
            windowLoadedMs,
            ...(await rendererStartupTimings(mainWindow.webContents)),
            backendReadyMs,
        }
        console.log(`Smoke: startup ${JSON.stringify(startup)}`)
        await Effect.runPromise(rpcServer.shutdown)
        await Effect.runPromise(rpcServer.close)
        app.exit(0)
        return
    }
    let allowQuit = false
    let quitInProgress = false

    const requestQuit = async () => {
        if (allowQuit || quitInProgress) return
        quitInProgress = true
        try {
            const status = await Effect.runPromise(rpcServer.shutdownStatus)
            if (status.captureId || status.activeExportIds.length > 0) {
                const captureText = status.captureId
                    ? 'The active capture will be stopped and finalized.'
                    : ''
                const exportText =
                    status.activeExportIds.length > 0
                        ? `${status.activeExportIds.length} active export${status.activeExportIds.length === 1 ? '' : 's'} will be cancelled and partial files removed.`
                        : ''
                const action = status.captureId
                    ? status.activeExportIds.length > 0
                        ? 'Stop capture, cancel exports and quit'
                        : 'Stop capture and quit'
                    : 'Cancel exports and quit'
                const result = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: 'Quit Pruftnet?',
                    message: 'Background capture work is still active.',
                    detail: [captureText, exportText].filter(Boolean).join('\n'),
                    buttons: [action, 'Stay'],
                    defaultId: 1,
                    cancelId: 1,
                    noLink: true,
                })
                if (result.response !== 0) return
            }
            await Effect.runPromise(rpcServer.shutdown)
            await Effect.runPromise(rpcServer.close)
            allowQuit = true
            app.quit()
        } catch (error) {
            await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'Pruftnet could not quit safely',
                message: 'Capture or export finalization failed.',
                detail: String(error),
                buttons: ['Stay'],
            })
        } finally {
            quitInProgress = false
        }
    }

    mainWindow.on('close', (event) => {
        if (process.platform !== 'darwin' && !allowQuit) {
            event.preventDefault()
            void requestQuit()
        }
    })

    app.on('before-quit', (event) => {
        if (allowQuit) return
        event.preventDefault()
        void requestQuit()
    })

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainWindow = await createMainWindow({ rpcUrl: rpcServer.rpcUrl })
        }
    })

    await backendReady
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

bootstrap().catch((error: unknown) => {
    console.error('Failed to start desktop app', error)
    if (!process.argv.includes('--smoke-test')) {
        dialog.showErrorBox(
            'Pruftnet could not start',
            error instanceof Error ? error.message : String(error),
        )
    }
    app.exit(1)
})

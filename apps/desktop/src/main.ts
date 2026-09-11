import { app, BrowserWindow, dialog } from 'electron'
import { Effect } from 'effect'
import { releaseName } from '@repo/core'
import { join } from 'node:path'

import { createMainWindow } from './main/create-window'
import { installApplicationMenu } from './main/application-menu'
import { DesktopExportDestinations } from './main/export-destinations'
import { registerIpcHandlers } from './main/ipc'
import { startDesktopRpcServer } from './main/rpc-server'

async function bootstrap() {
    const smoke = process.argv.includes('--smoke-test')
    if (smoke) console.log('Smoke: bootstrap')
    app.setName(releaseName)
    if (app.isPackaged) {
        app.setPath('userData', join(app.getPath('appData'), releaseName, 'electron'))
        process.env.PRUFTNET_CAPTURE_WORKER_PATH = join(
            process.resourcesPath,
            'native',
            process.platform === 'win32'
                ? 'pruftnet_capture_worker.exe'
                : 'pruftnet_capture_worker',
        )
    }
    await app.whenReady()
    if (smoke) console.log('Smoke: Electron ready')

    const exportDestinations = new DesktopExportDestinations()
    const rpcServer = await Effect.runPromise(startDesktopRpcServer(exportDestinations))
    if (smoke) console.log('Smoke: backend ready')

    registerIpcHandlers(exportDestinations)
    installApplicationMenu()
    let mainWindow = await createMainWindow({ rpcUrl: rpcServer.rpcUrl })
    if (smoke) {
        console.log('Smoke: renderer loaded')
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

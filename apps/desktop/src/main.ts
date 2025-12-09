import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { trpcServer } from '@repo/utils'
import { appRouter, appWsRouter } from '@repo/core-node'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
    app.quit()
}

const createWindow = () => {
    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 1800,
        height: 1100,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    // and load the index.html of the app.
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    } else {
        mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
    }

    // Open the DevTools.
    mainWindow.webContents.openDevTools()
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    ipcMain.on('theme:change', (_, theme) => {
        nativeTheme.themeSource = theme
    })

    const mainWindows = BrowserWindow.getAllWindows()[0]
    ipcMain.handle('trpc', trpcServer.createElectronHandler(appRouter))
    ipcMain.handle('trpc-stream', trpcServer.createIPCStreamHandler(appWsRouter, mainWindows))
})

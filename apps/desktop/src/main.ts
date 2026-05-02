import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import squirrelStartup from 'electron-squirrel-startup'
import path from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (squirrelStartup) app.quit()

// Determine if running in packaged mode
const isPackaged = app.isPackaged

// Set up paths before importing any @repo/* modules
const userDataPath = app.getPath('userData')
const resourcesPath = isPackaged ? process.resourcesPath! : path.resolve(__dirname, '../../..')

// Ensure userData directory exists
if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
}

// Set environment variables for downstream modules (core-node, core-cpp)
// These MUST be set before importing @repo/core-node
process.env.IS_PACKAGED = String(isPackaged)
process.env.USER_DATA_PATH = userDataPath
process.env.RESOURCES_PATH = resourcesPath

// Database path: userData in production, dev.db in development
if (isPackaged) {
    process.env.DATABASE_URL = `file:${path.join(userDataPath, 'pruftnet.db')}`
}

// Now import modules that depend on the environment variables
const initApp = async () => {
    const { trpcServer } = await import('@repo/utils')
    const { appRouter, appWsRouter } = await import('@repo/core-node')

    const createWindow = () => {
        // Create the browser window.
        const mainWindow = new BrowserWindow({
            width: 1800,
            height: 1100,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
            },
            icon: path.join(__dirname, '../assets/icons/icon.png'),
        })

        // and load the index.html of the app.
        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
            mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
        } else {
            mainWindow.loadFile(
                path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
            )
        }

        // Open DevTools only in development
        if (!isPackaged) {
            mainWindow.webContents.openDevTools()
        }

        return mainWindow
    }

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

    await app.whenReady()

    const mainWindow = createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    ipcMain.on('theme:change', (_, theme) => {
        nativeTheme.themeSource = theme
    })

    ipcMain.handle('trpc', trpcServer.createElectronHandler(appRouter))
    ipcMain.handle('trpc-stream', trpcServer.createIPCStreamHandler(appWsRouter, mainWindow))
}

initApp().catch((err) => {
    console.error('Failed to initialize app:', err)
    app.quit()
})

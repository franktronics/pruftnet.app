import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import path from 'node:path'
import started from 'electron-squirrel-startup'

const MAIN_SERVER_URL = import.meta.env.MAIN_SERVER_URL
const MAIN_ENTRY_FILE = import.meta.env.MAIN_ENTRY_FILE
const isDev = import.meta.env.MODE === 'development'

if (started) {
    app.quit()
}

const createWindow = async () => {
    const mainWindow = new BrowserWindow({
        width: 1300, //1800
        height: 850, //1100
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
    })

    if (MAIN_SERVER_URL && isDev) {
        await mainWindow.loadURL(MAIN_SERVER_URL)
        //mainWindow.webContents.openDevTools()
    } else {
        await mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_ENTRY_FILE}/index.html`))
    }

    ipcMain.on('theme:change', (_, theme) => {
        nativeTheme.themeSource = theme
    })
}

app.on('ready', createWindow)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        await createWindow()
    }
})

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    changeTheme: (theme: string) => ipcRenderer.send('theme:change', theme),
})

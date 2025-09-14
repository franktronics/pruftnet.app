import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    changeTheme: (theme: 'dark' | 'light' | 'system') => ipcRenderer.send('theme:change', theme),
})

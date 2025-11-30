import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    changeTheme: (theme: string) => ipcRenderer.send('theme:change', theme),
    trpcHandler: (args: { basePath: string; procedureName: string; input?: any }) => {
        return ipcRenderer.invoke(args.basePath, args)
    },
})

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    changeTheme: (theme: string) => ipcRenderer.send('theme:change', theme),

    trpcHandler: (args: { basePath: string; procedureName: string; input?: any }) => {
        return ipcRenderer.invoke(args.basePath, args)
    },

    trpcConnectIPCStream: (args: { streamPath: string; procedureName: string; input?: any }) => {
        return ipcRenderer.invoke(args.streamPath, args)
    },
    trpcHandleIPCStream: (callback: (data: any) => void) => {
        return ipcRenderer.on('trpc-ipc-stream-response', (event, data) => callback(data))
    },
})

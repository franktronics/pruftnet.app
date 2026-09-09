import { contextBridge, ipcRenderer } from 'electron'

import type {
    ApplicationCommandId,
    ApplicationCommandStateSnapshot,
} from '@repo/shared/app-command'

type DesktopTheme = 'dark' | 'light' | 'system'

function readArgumentValue(prefix: string) {
    const argument = process.argv.find((value) => value.startsWith(prefix))
    return argument?.slice(prefix.length)
}

const rpcUrl = readArgumentValue('--pruftnet-rpc-url=')

if (!rpcUrl) {
    throw new Error('Missing desktop RPC URL')
}

contextBridge.exposeInMainWorld('pruftnet', {
    platform: process.platform,
    rpcUrl,
    setTheme: (theme: DesktopTheme) => ipcRenderer.invoke('theme:set', theme),
    selectExportDestination: (format: 'pcapng' | 'pcap') =>
        ipcRenderer.invoke('export:select-destination', format),
    updateApplicationMenu: (snapshot: ApplicationCommandStateSnapshot) =>
        ipcRenderer.send('application-menu:update-state', snapshot),
    onApplicationCommand: (listener: (id: ApplicationCommandId) => void) => {
        const receiveCommand = (_event: Electron.IpcRendererEvent, id: ApplicationCommandId) =>
            listener(id)
        ipcRenderer.on('application-menu:execute', receiveCommand)
        return () => ipcRenderer.removeListener('application-menu:execute', receiveCommand)
    },
})

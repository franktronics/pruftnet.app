import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'

import {
    applicationCommands,
    electronAccelerator,
    isApplicationCommandStateSnapshot,
    resolveCaptureCycleCommand,
    type ApplicationCommandId,
    type ApplicationCommandState,
    type ApplicationCommandStateSnapshot,
} from '@repo/shared/app-command'

const commandById = new Map(applicationCommands.map((command) => [command.id, command]))

function accelerator(id: ApplicationCommandId) {
    const shortcut = commandById.get(id)?.shortcut
    return shortcut ? electronAccelerator(shortcut) : undefined
}

function commandItem(
    id: ApplicationCommandId,
    options: Partial<MenuItemConstructorOptions> = {},
): MenuItemConstructorOptions {
    const command = commandById.get(id)
    if (!command) throw new Error(`Unknown application command: ${id}`)

    return {
        id,
        label: command.label,
        accelerator: accelerator(id),
        enabled: false,
        click: () => sendCommand(id),
        ...options,
    }
}

function sendCommand(id: ApplicationCommandId) {
    const window = BrowserWindow.getFocusedWindow()
    if (window && !window.webContents.isDestroyed()) {
        window.webContents.send('application-menu:execute', id)
    }
}

function buildTemplate(): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = []

    if (process.platform === 'darwin') {
        template.push({
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                commandItem('settings'),
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        })
    }

    template.push({
        label: 'File',
        submenu: [
            commandItem('new-capture'),
            commandItem('export-capture'),
            { type: 'separator' },
            commandItem('discard-active-capture'),
            { type: 'separator' },
            ...(process.platform === 'darwin'
                ? ([{ role: 'close' }] satisfies MenuItemConstructorOptions[])
                : ([
                      commandItem('settings'),
                      { type: 'separator' },
                      { role: 'quit' },
                  ] satisfies MenuItemConstructorOptions[])),
        ],
    })

    template.push(
        { role: 'editMenu' },
        {
            label: 'Capture',
            submenu: [
                {
                    id: 'capture-cycle',
                    label: 'Start Capture',
                    accelerator: accelerator('start-capture'),
                    enabled: false,
                    click: () => {
                        sendCommand(resolveCaptureCycleCommand(focusedSnapshot()).commandId)
                    },
                },
                commandItem('capture-settings'),
                { type: 'separator' },
                commandItem('active-capture'),
            ],
        },
        {
            label: 'Go',
            submenu: [
                commandItem('capture-workspace'),
                commandItem('history'),
                { type: 'separator' },
                commandItem('back'),
            ],
        },
        {
            label: 'View',
            submenu: [
                commandItem('command-palette'),
                commandItem('toggle-sidebar'),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
                ...(!app.isPackaged
                    ? ([
                          { type: 'separator' },
                          { role: 'reload' },
                          { role: 'toggleDevTools' },
                      ] satisfies MenuItemConstructorOptions[])
                    : []),
            ],
        },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [commandItem('keyboard-shortcuts')],
        },
    )

    return template
}

const snapshots = new Map<number, ApplicationCommandStateSnapshot>()
let applicationMenu: Menu | null = null

function focusedSnapshot(): ApplicationCommandStateSnapshot {
    const id = BrowserWindow.getFocusedWindow()?.webContents.id
    return id === undefined ? {} : (snapshots.get(id) ?? {})
}

function effectiveState(
    snapshot: ApplicationCommandStateSnapshot,
    id: ApplicationCommandId,
): ApplicationCommandState {
    return snapshot[id] ?? { enabled: false }
}

function applyFocusedState() {
    if (!applicationMenu) return
    const snapshot = focusedSnapshot()

    for (const command of applicationCommands) {
        const item = applicationMenu.getMenuItemById(command.id)
        if (!item) continue
        const state = effectiveState(snapshot, command.id)
        item.enabled = state.enabled && !state.pending
        item.label = state.label ?? command.label
    }

    const cycle = applicationMenu.getMenuItemById('capture-cycle')
    if (!cycle) return
    const state = resolveCaptureCycleCommand(snapshot)
    cycle.enabled = state.enabled
    cycle.label = state.label
}

export function installApplicationMenu() {
    applicationMenu = Menu.buildFromTemplate(buildTemplate())
    Menu.setApplicationMenu(applicationMenu)
    applyFocusedState()

    ipcMain.on('application-menu:update-state', (event, snapshot: unknown) => {
        if (!isApplicationCommandStateSnapshot(snapshot)) return
        const window = BrowserWindow.fromWebContents(event.sender)
        if (!window) return

        const firstSnapshot = !snapshots.has(event.sender.id)
        snapshots.set(event.sender.id, snapshot)
        if (firstSnapshot) {
            event.sender.once('destroyed', () => snapshots.delete(event.sender.id))
        }
        if (BrowserWindow.getFocusedWindow() === window) applyFocusedState()
    })

    app.on('browser-window-focus', applyFocusedState)
    app.on('browser-window-blur', applyFocusedState)
}

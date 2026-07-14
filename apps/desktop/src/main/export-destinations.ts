import { randomBytes } from 'node:crypto'

import { BrowserWindow, dialog, type SaveDialogOptions } from 'electron'

type ExportFormat = 'pcapng' | 'pcap'

interface PendingDestination {
    readonly path: string
    readonly format: ExportFormat
    readonly createdAt: number
}

const TOKEN_LIFETIME_MS = 15 * 60 * 1_000

export class DesktopExportDestinations {
    readonly #pending = new Map<string, PendingDestination>()

    async select(window: BrowserWindow | undefined, format: ExportFormat) {
        const extension = format === 'pcapng' ? 'pcapng' : 'pcap'
        const options: SaveDialogOptions = {
            title: 'Export capture',
            defaultPath: `capture.${extension}`,
            filters: [
                {
                    name: format === 'pcapng' ? 'PCAP Next Generation' : 'PCAP Capture',
                    extensions: [extension],
                },
            ],
            properties: ['createDirectory', 'showOverwriteConfirmation'],
        }
        const result = window
            ? await dialog.showSaveDialog(window, options)
            : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return null
        this.#discardExpired()
        const token = randomBytes(32).toString('hex')
        this.#pending.set(token, { path: result.filePath, format, createdAt: Date.now() })
        return token
    }

    async consume(token: string, format: ExportFormat) {
        this.#discardExpired()
        const destination = this.#pending.get(token)
        this.#pending.delete(token)
        return destination?.format === format ? destination.path : undefined
    }

    #discardExpired() {
        const threshold = Date.now() - TOKEN_LIFETIME_MS
        for (const [token, destination] of this.#pending) {
            if (destination.createdAt < threshold) this.#pending.delete(token)
        }
    }
}

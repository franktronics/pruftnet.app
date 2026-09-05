import type { Server as NodeServer } from 'node:http'

// Capture/export finalization must finish before this transport shutdown starts.
// An abandoned streaming response must not keep the application alive forever.
export function beginNodeServerClose(server: NodeServer, drainTimeoutMs = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve()
            return
        }
        const deadline = setTimeout(() => server.closeAllConnections(), drainTimeoutMs)
        deadline.unref()
        server.close((error) => {
            clearTimeout(deadline)
            if (error) reject(error)
            else resolve()
        })
    })
}

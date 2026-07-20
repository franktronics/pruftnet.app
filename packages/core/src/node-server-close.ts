import type { Server as NodeServer } from 'node:http'

export function beginNodeServerClose(server: NodeServer): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve()
            return
        }
        server.close((error) => {
            if (error) reject(error)
            else resolve()
        })
    })
}

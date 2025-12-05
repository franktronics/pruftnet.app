import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'

type WSSHandler = (ws: WebSocket, req: IncomingMessage) => void
export function createWSSMiddleware(): WSSHandler {
    return (ws: WebSocket, req: IncomingMessage) => {}
}

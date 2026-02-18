import { type CustomErrorType, ErrorType } from '../trpc-types'
import type { WebSocket } from 'ws'

/*
 * ServerError class to handle errors in both desktop (Electron) and web (HTTP) environments.
 * Depending on the environment, it either throws an HTTP error or returns an IPC error object.
 * Use it only in the server-side code(node).
 */
export class ServerError {
    constructor(private props: Omit<CustomErrorType, 'type'>) {}

    /**
     * Throws an HTTP error with the appropriate status code and message.
     * The error will be parsed on the client side to create a ClientError.
     * @throws An error with the specified message and cause.
     */
    public http() {
        throw new Error(this.props.message, {
            cause: { ...this.props, type: ErrorType.HTTP_ERROR },
        })
    }

    /**
     * Throws a generic error with the specified message and cause.
     * The error will be parsed on the client side to create a ClientError.
     * @throws An error with the specified message and cause.
     */
    public throw() {
        throw new Error(this.props.message, {
            cause: { ...this.props, type: ErrorType.GENERIC_ERROR },
        })
    }

    /**
     * Send the error object suitable for IPC communication.
     * The error will be parsed on the client side to create a ClientError.
     * @returns An object representing the error for IPC.
     */
    public ipc() {
        return { error: { ...this.props, type: ErrorType.IPC_ERROR } }
    }

    /**
     * Sends the error over the provided WebSocket instance.
     * @param wsInst The WebSocket instance to send the error through.
     */
    public ws(wsInst: WebSocket) {
        wsInst.send(JSON.stringify({ error: { ...this.props, type: ErrorType.WS_ERROR } }))
    }

    /**
     * Closes the WebSocket connection with the appropriate error code and message.
     * @param wsInst The WebSocket instance to close.
     */
    public wsClose(wsInst: WebSocket) {
        wsInst.send(JSON.stringify({ error: { ...this.props, type: ErrorType.WS_ERROR } }))
        wsInst.close(this.props.code || 1011)
    }
}

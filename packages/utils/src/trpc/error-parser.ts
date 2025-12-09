import type { WebSocket } from 'ws'

export enum ErrorType {
    IPC_ERROR = 'ipc-error',
    HTTP_ERROR = 'http-error',
    WS_ERROR = 'ws-error',
}

export type CustomErrorType = {
    code: number
    message: string
    type: ErrorType
    origin?: string
    whatToDo?: string
    data?: any
}

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
        wsInst.close(
            this.props.code,
            JSON.stringify({ error: { ...this.props, type: ErrorType.WS_ERROR } }),
        )
    }
}

/*
 * ClientError class to parse and handle errors received from the server.
 * It extracts relevant information such as origin, code, whatToDo, and additional data.
 * Use it only in the client-side code(browser or desktop).
 */
export class ClientError extends Error {
    constructor(props: CustomErrorType) {
        super(props.message)
        this.name = 'ClientError -> ' + props.type
        this.cause = { ...props }
    }

    public getErrorData(): CustomErrorType {
        return this.cause as CustomErrorType
    }

    get type(): ErrorType {
        const cause = this.cause as CustomErrorType
        return cause.type
    }

    get origin(): string | undefined {
        const cause = this.cause as CustomErrorType
        return cause?.origin
    }

    get code(): number {
        const cause = this.cause as CustomErrorType
        return cause.code
    }

    get whatToDo(): string | undefined {
        const cause = this.cause as CustomErrorType
        return cause?.whatToDo
    }

    get data(): any {
        const cause = this.cause as CustomErrorType
        return cause?.data
    }
}

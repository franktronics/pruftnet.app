export type CustomErrorType = {
    code: number
    message: string
    origin?: string
    whatToDo?: string
    data?: any
}
export enum ErrorType {
    IPC_ERROR = 'ipc-error',
    HTTP_ERROR = 'http-error',
}
/*
 * ServerError class to handle errors in both desktop (Electron) and web (HTTP) environments.
 * Depending on the environment, it either throws an HTTP error or returns an IPC error object.
 * Use it only in the server-side code(node).
 */
export class ServerError {
    private readonly isDesktop: boolean

    constructor(props: CustomErrorType) {
        this.isDesktop = process.env.WEB === undefined
        if (this.isDesktop) {
            this.throwIPCError(props)
        } else {
            this.throwHttpError(props)
        }
    }

    private throwHttpError(props: CustomErrorType) {
        throw new Error(props.message, { cause: { ...props, type: ErrorType.HTTP_ERROR } })
    }

    private throwIPCError(props: CustomErrorType) {
        return { ...props, type: ErrorType.IPC_ERROR }
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
        this.name = 'ClientError'
        this.cause = { ...props }
    }

    public getErrorData(): CustomErrorType {
        return this.cause as CustomErrorType
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

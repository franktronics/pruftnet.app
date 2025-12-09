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

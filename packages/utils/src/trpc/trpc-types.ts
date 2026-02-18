import { MapStore } from './context/map-store'
import { ClientError } from './client/client-error'

export enum ErrorType {
    IPC_ERROR = 'ipc-error',
    HTTP_ERROR = 'http-error',
    WS_ERROR = 'ws-error',
    GENERIC_ERROR = 'generic-error',
}

export type CustomErrorType = {
    code: number
    message: string
    type?: ErrorType
    origin?: string
    whatToDo?: string
    data?: any
}

export type ClientErrorType = ClientError

export type MapStoreType<K, V> = MapStore<K, V>

export { type HttpMethod } from './client/client'

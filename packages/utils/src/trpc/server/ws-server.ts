import type { WSProcedureDefinition, WSRouterDef } from './ws-procedure'
import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import { ServerError } from './server-error'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'

/**
 * Creates a WebSocket server handler for the given tRPC WebSocket router.
 *
 * @param router - The tRPC WebSocket router definition.
 * @returns A WebSocket server handler function.
 */
type WSSHandler = (ws: WebSocket, req: IncomingMessage) => void
export function createWSSMiddleware<T extends WSRouterDef>(router: T): WSSHandler {
    return async (ws: WebSocket, req: IncomingMessage) => {
        try {
            const url = new URL(req.url || '', `http://${req.headers.host}`)
            const procedureName = url.searchParams.get('procedure')

            if (!procedureName) {
                return new ServerError({
                    code: 1008,
                    origin: 'createWSSMiddleware',
                    message: 'Procedure name is required',
                }).wsClose(ws)
            }

            const pathParts = procedureName.split('.')
            let current: any = router
            for (const part of pathParts) {
                if (current[part]) {
                    current = current[part]
                } else {
                    return new ServerError({
                        code: 1008,
                        origin: 'createWSSMiddleware',
                        message: 'Procedure not found',
                    }).wsClose(ws)
                }
            }

            const procDef: WSProcedureDefinition<any, any> = current
            ws.on('message', async (message: string) => {
                let inputData: any = undefined
                if (procDef.input) {
                    try {
                        const parsed = JSON.parse(message)
                        const validation = procDef.input.safeParse(parsed.input)

                        if (!validation.success) {
                            return new ServerError({
                                code: 1008,
                                origin: 'createWSSMiddleware',
                                message: 'Invalid input',
                                whatToDo: 'Ensure the input data matches the expected schema.',
                            }).wsClose(ws)
                        }
                        inputData = validation.data
                    } catch (error) {
                        return new ServerError({
                            code: 1008,
                            origin: 'createWSSMiddleware',
                            message: 'Invalid input format',
                        }).wsClose(ws)
                    }
                }

                const returnCb = (data: any) => {
                    ws.send(JSON.stringify(data))
                }

                try {
                    await procDef.handler(inputData, returnCb)
                } catch (error: any) {
                    return new ServerError({
                        code: error.cause?.code || 1011,
                        origin: 'createWSSMiddleware',
                        message: error?.message || 'Procedure handler error',
                        data: error.cause?.data || error,
                    }).wsClose(ws)
                }
            })

            ws.on('error', (err) => {
                return new ServerError({
                    code: 1011,
                    origin: 'createWSSMiddleware',
                    message: err.message,
                    data: err,
                }).wsClose(ws)
            })
        } catch (err: any) {
            return new ServerError({
                code: 1011,
                origin: 'createWSSMiddleware',
                message: 'Internal Server Error',
            }).wsClose(ws)
        }
    }
}

/**
 * Creates a IPC event handler to receive an IPC-main-to-render request and start a IPC-main-to-render stream.
 *
 * @param router - The tRPC WebSocket router definition.
 * @param mainWindows - The main BrowserWindow instance to communicate with.
 * @returns An IPC stream handler function.
 */
type IPCStreamHandler = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
export function createIPCStreamHandler<T extends WSRouterDef>(
    router: T,
    mainWindows: BrowserWindow,
): IPCStreamHandler {
    return async (_, data: any) => {
        try {
            const procedure = data.procedureName
            if (!procedure) {
                return new ServerError({
                    code: 400,
                    origin: 'createIPCStreamHandler',
                    message: 'Procedure name is required',
                }).ipc()
            }

            const procedurePath = procedure.split('.')
            let current: any = router
            for (const segment of procedurePath) {
                if (!current[segment]) {
                    return new ServerError({
                        code: 404,
                        origin: 'createIPCStreamHandler',
                        message: 'Procedure not found',
                    }).ipc()
                }
                current = current[segment]
            }

            const procDef: WSProcedureDefinition<any, any> = current
            let inputData = data.input

            if (procDef.input) {
                const validation = procDef.input.safeParse(inputData)
                if (!validation.success) {
                    return new ServerError({
                        code: 400,
                        origin: 'createIPCStreamHandler',
                        message: 'Invalid input',
                        whatToDo: 'Ensure the input data matches the expected schema.',
                        data: validation.error.format(),
                    }).ipc()
                }
                inputData = validation.data
            }

            const returnCb = (data: any) => {
                mainWindows.webContents.send('trpc-ipc-stream-response', data)
            }

            try {
                return await procDef.handler(inputData, returnCb)
            } catch (error: any) {
                return new ServerError({
                    code: error.cause?.code || 500,
                    origin: 'createIPCStreamHandler',
                    message: error?.message || 'Procedure handler error',
                    data: error.cause?.data || error,
                }).ipc()
            }
        } catch (err: any) {
            return new ServerError({
                code: 500,
                message: 'Internal Server Error',
                origin: 'createIPCStreamHandler',
                whatToDo: 'Try again later or contact support if the issue persists.',
            }).ipc()
        }
    }
}

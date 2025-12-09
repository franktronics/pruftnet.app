import type { WSProcedureDefinition, WSRouterDef } from './ws-procedure'
import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'
import { ServerError } from './error-parser'

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
                            }).wsClose(ws)
                        }
                        inputData = validation.data
                    } catch (error) {
                        return new ServerError({
                            code: 1008,
                            origin: 'createWSSMiddleware',
                            message: 'Invalid input format',
                            data: error,
                        }).wsClose(ws)
                    }
                }

                const returnCb = (data: any) => {
                    ws.send(JSON.stringify(data))
                }

                try {
                    await procDef.handler(inputData, returnCb, { ws, req })
                } catch (error) {
                    return new ServerError({
                        code: 1011,
                        origin: 'createWSSMiddleware',
                        message: 'Procedure handler error',
                        data: error,
                    }).wsClose(ws)
                }
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

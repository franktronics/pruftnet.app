import type { WSProcedureDefinition, WSRouterDef } from './ws-procedure'
import type { IncomingMessage } from 'node:http'
import type { WebSocket } from 'ws'

type WSSHandler = (ws: WebSocket, req: IncomingMessage) => void
export function createWSSMiddleware<T extends WSRouterDef>(router: T): WSSHandler {
    return (ws: WebSocket, req: IncomingMessage) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`)
        const procedureName = url.searchParams.get('procedure')

        if (!procedureName) {
            ws.close(1008, 'Procedure name is required')
            return
        }

        const pathParts = procedureName.split('.')
        let current: any = router
        for (const part of pathParts) {
            if (current[part]) {
                current = current[part]
            } else {
                ws.close(1008, 'Procedure not found')
                return
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
                        ws.close(1008, 'Invalid input')
                        return
                    }
                    inputData = validation.data
                } catch {
                    ws.close(1008, 'Invalid input format')
                    return
                }
            }

            const returnCb = (data: any) => {
                ws.send(JSON.stringify(data))
            }

            try {
                await procDef.handler(inputData, returnCb, { ws, req })
            } catch (error) {
                ws.close(1011, 'Internal server error')
            }
        })
    }
}

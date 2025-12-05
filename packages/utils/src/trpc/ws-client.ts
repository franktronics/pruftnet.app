import type { WSRouterDef, WSProcedureDefinition } from './ws-procedure'
import { z } from 'zod'

export interface WSClientConfig {
    baseWsUrl: string
    isDesktop: boolean
}

type InferProcedureWsClient<T> = 
    T extends WSProcedureDefinition<infer TInput, infer TOutput>
        ? {
              handle: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>, returnCb?: (data: TOutput) => void) => void
                  : (returnCb?: (data: TOutput) => void) => void
          }
        : never

type InferWsRouteClient<T extends WSRouterDef> = {
    [K in keyof T]: T[K] extends WSProcedureDefinition
        ? InferProcedureWsClient<T[K]>
        : T[K] extends WSRouterDef
          ? InferWsRouteClient<T[K]>
          : never
}

export function createWsClient<T extends WSRouterDef>(config: WSClientConfig) {
    const createProcedureProxy = (procedurePath: string[] = []): any => {
        return new Proxy(
            {},
            {
                get(_, prop: string) {
                    const newPath = [...procedurePath, prop]

                    //if it is not a handle, continue building the path
                    if (prop !== 'handle') {
                        return createProcedureProxy(newPath)
                    }

                    return (input?: any, returnCb?: (data: any) => void) => {
                        const procedureName = procedurePath.join('.')

                        return config.isDesktop 
                            ? makeIPCConnection({
                                procedureName,
                                baseWsUrl: config.baseWsUrl,
                                input,
                                returnCb,
                            })
                            : makeWsConnection({
                                procedureName,
                                baseWsUrl: config.baseWsUrl,
                                input,
                                returnCb,
                            })
                    }
                }
            }
        )
    }

    return createProcedureProxy() as InferWsRouteClient<T>
}

type WSConnectionMaker = {
    procedureName: string
    baseWsUrl: string
    input?: any
    returnCb?: (data: any) => void
}
function makeWsConnection(props: WSConnectionMaker) {
    const { procedureName, baseWsUrl, input, returnCb } = props
    const wsUrl = baseWsUrl + `?procedure=${procedureName}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
        //Send the input data if provided
        if (input !== undefined) {
            ws.send(JSON.stringify({ input }))
        }
    }

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (returnCb) {
            returnCb(data)
        }
    }

    ws.onerror = (event) => {
        console.error('WebSocket error:', event)
    }

    ws.onclose = () => {
        console.log('WebSocket connection closed')
    }
}

type IPCConnectionMaker = {
}
function makeIPCConnection(props: IPCConnectionMaker) {
    // Implementation for IPC connection can be added here
}
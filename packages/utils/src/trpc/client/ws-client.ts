import { ErrorType } from '../trpc-types'
import { ClientError } from './client-error'
import type { WSRouterDef, WSProcedureDefinition } from '../server/ws-procedure'
import { z } from 'zod'

export interface WSClientConfig {
    baseWsUrl: string
    isDesktop: boolean
    iPCStreamPath: string
}

type HandlerEvents<T = any> = {
    onMessage?: (data: T) => void
}

type InferProcedureWsClient<T> =
    T extends WSProcedureDefinition<infer TInput, infer TOutput>
        ? {
              handle: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>, events?: HandlerEvents<TOutput>) => Promise<void>
                  : (events?: HandlerEvents<TOutput>) => Promise<void>
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

                    return async (input?: any, events?: HandlerEvents) => {
                        const procedureName = procedurePath.join('.')

                        if (config.isDesktop) {
                            return await makeIPCConnection({
                                procedureName,
                                streamPath: config.iPCStreamPath,
                                input,
                                events,
                            })
                        } else {
                            return await makeWsConnection({
                                procedureName,
                                baseWsUrl: config.baseWsUrl,
                                input,
                                events,
                            })
                        }
                    }
                },
            },
        )
    }

    return createProcedureProxy() as InferWsRouteClient<T>
}

type WSConnectionMaker = {
    procedureName: string
    baseWsUrl: string
    input?: any
    events?: HandlerEvents
}
async function makeWsConnection(props: WSConnectionMaker) {
    const { procedureName, baseWsUrl, input, events } = props
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
        if (events && events.onMessage) {
            events.onMessage(data)
        }
    }

    ws.onerror = (event) => {
        console.error('WebSocket error:', event)
    }

    ws.onclose = (event) => {
        console.log('WebSocket connection closed', event)
    }
}

type IPCConnectionMaker = {
    procedureName: string
    streamPath: string
    input?: any
    events?: HandlerEvents
}
async function makeIPCConnection(props: IPCConnectionMaker) {
    const { procedureName, streamPath, input, events } = props
    const response = await (window as any).electron.trpcConnectIPCStream({
        streamPath,
        procedureName,
        input,
    })
    if (response && response.error && response.error.type === ErrorType.IPC_ERROR) {
        throw new ClientError({ ...response.error })
    }
    void (window as any).electron.trpcHandleIPCStream((data: any) => {
        if (events && events.onMessage) {
            events.onMessage(data)
        }
    })
}

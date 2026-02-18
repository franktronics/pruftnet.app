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
    onmessage?: (data: T) => void
    onerror?: (error: ClientError) => void
}
type HandlerReturnType = {
    closeConnection: () => void
}

type InferProcedureWsClient<T> =
    T extends WSProcedureDefinition<infer TInput, infer TOutput>
        ? {
              handle: TInput extends z.ZodSchema
                  ? (
                        input: z.infer<TInput>,
                        events?: HandlerEvents<TOutput>,
                    ) => Promise<HandlerReturnType>
                  : (events?: HandlerEvents<TOutput>) => Promise<HandlerReturnType>
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

                    return async (
                        input?: any,
                        events?: HandlerEvents,
                    ): Promise<HandlerReturnType> => {
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
async function makeWsConnection(props: WSConnectionMaker): Promise<HandlerReturnType> {
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
        try {
            const data = JSON.parse(event.data)
            if (data && data.error) {
                if (events && events.onerror) {
                    events.onerror(new ClientError(data.error))
                }
                return
            }
            if (events && events.onmessage) {
                events.onmessage(data)
            }
        } catch (err) {
            if (events && events.onerror) {
                events.onerror(
                    new ClientError({
                        type: ErrorType.WS_ERROR,
                        message: 'Invalid message format',
                        data: err,
                        code: 1003,
                    }),
                )
            }
        }
    }

    ws.onerror = (event) => {
        if (events && events.onerror) {
            events.onerror(
                new ClientError({
                    type: ErrorType.WS_ERROR,
                    message: 'WebSocket error occurred',
                    data: event,
                    code: 1006,
                }),
            )
        }
    }

    ws.onclose = (event) => {
        try {
            const reason = JSON.parse(event.reason)
            if (reason && reason.error && events && events.onerror) {
                events.onerror(new ClientError(reason.error))
            }
        } catch (err) {
            //If the reason is not JSON, ignore
        }
    }

    return {
        closeConnection: () => {
            ws.close()
        },
    }
}

type IPCConnectionMaker = {
    procedureName: string
    streamPath: string
    input?: any
    events?: HandlerEvents
}
async function makeIPCConnection(props: IPCConnectionMaker): Promise<HandlerReturnType> {
    const { procedureName, streamPath, input, events } = props
    const response = await (window as any).electron.trpcConnectIPCStream({
        streamPath,
        procedureName,
        input,
    })
    if (response && response.error && response.error.type === ErrorType.IPC_ERROR) {
        if (events && events.onerror) {
            events.onerror(new ClientError(response.error))
        }
        return { closeConnection: () => {} }
    }
    void (window as any).electron.trpcHandleIPCStream((data: any) => {
        if (data && data.error) {
            if (events && events.onerror) {
                events.onerror(new ClientError(response.error))
            }
            return
        }
        if (events && events.onmessage) {
            events.onmessage(data)
        }
    })

    return {
        closeConnection: () => {},
    }
}

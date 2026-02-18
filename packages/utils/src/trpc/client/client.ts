import { ErrorType } from '../trpc-types'
import { ClientError } from './client-error'
import type { RouterDef, ProcedureDefinition } from '../server/procedure'
import { z } from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ClientConfig {
    baseHttpUrl: string
    baseIPCPath: string
    isDesktop: boolean
    headers?: Record<string, string>
}

type InferProcedureClient<T> =
    T extends ProcedureDefinition<infer TInput, infer TOutput>
        ? {
              query: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>) => () => Promise<TOutput>
                  : () => () => Promise<TOutput>
              mutate: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>, method?: HttpMethod) => () => Promise<TOutput>
                  : (method?: HttpMethod) => () => Promise<TOutput>
          }
        : never

type InferRouteClient<T extends RouterDef> = {
    [K in keyof T]: T[K] extends ProcedureDefinition
        ? InferProcedureClient<T[K]>
        : T[K] extends RouterDef
          ? InferRouteClient<T[K]>
          : never
}

export function createClient<T extends RouterDef>(config: ClientConfig) {
    const createProcedureProxy = (procedurePath: string[] = []): any => {
        return new Proxy(
            {},
            {
                get(_, prop: string) {
                    const newPath = [...procedurePath, prop]

                    //if it is not a query or mutate, continue building the path
                    if (prop !== 'query' && prop !== 'mutate') {
                        return createProcedureProxy(newPath)
                    }

                    return (input?: any, method?: HttpMethod) => {
                        const procedureName = procedurePath.join('.')
                        const methodToUse = prop === 'query' ? 'GET' : method || 'POST'

                        //Make the fetch request

                        return config.isDesktop
                            ? makeIPCRequest({
                                  basePath: config.baseIPCPath,
                                  procedureName: procedureName,
                                  input,
                              })
                            : makeHttpRequest({
                                  headers: config.headers,
                                  baseUrl: config.baseHttpUrl,
                                  procedureName: procedureName,
                                  method: methodToUse,
                                  input,
                              })
                    }
                },
            },
        )
    }
    return createProcedureProxy() as InferRouteClient<T>
}

type HttpMakerProps = {
    headers: ClientConfig['headers']
    baseUrl: string
    procedureName: string
    method: HttpMethod
    input?: any
}
function makeHttpRequest(props: HttpMakerProps) {
    const { headers, baseUrl, procedureName, method, input } = props

    let url = `${baseUrl}/${procedureName}`
    if (method === 'GET' && input !== undefined) {
        const params = new URLSearchParams()
        params.set('input', JSON.stringify(input))
        url += `?${params.toString()}`
    }

    return async () => {
        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: method !== 'GET' && input !== undefined ? JSON.stringify(input) : undefined,
            })

            if (!response.ok) {
                const errorData = await response.json()
                if (errorData.error && errorData.error.type) {
                    throw new ClientError({ ...errorData.error })
                } else {
                    throw new ClientError({
                        code: response.status,
                        type: ErrorType.HTTP_ERROR,
                        origin: 'makeHttpRequest',
                        message: response.statusText,
                    })
                }
            }

            const data = await response.json()
            return data.result
        } catch (err) {
            if (err instanceof ClientError) {
                throw err
            }
            throw new ClientError({
                code: 500,
                message: err instanceof Error ? err.message : 'Unknown HTTP error',
                origin: 'makeHttpRequest',
                type: ErrorType.HTTP_ERROR,
            })
        }
    }
}

type IPCMakerProps = {
    basePath: string
    procedureName: string
    input?: any
}
function makeIPCRequest(props: IPCMakerProps) {
    const { basePath, procedureName, input } = props

    return async () => {
        try {
            const response = await (window as any).electron.trpcHandler({
                basePath,
                procedureName,
                input,
            })
            if (response.error && response.error) {
                throw new ClientError({ ...response.error })
            } else if (!response.result) {
                throw new ClientError({
                    code: 500,
                    message: 'Unknown IPC error',
                    origin: 'makeIPCRequest',
                    type: ErrorType.IPC_ERROR,
                })
            }
            return response.result
        } catch (err) {
            if (err instanceof ClientError) {
                throw err
            }
            throw new ClientError({
                code: 500,
                message: err instanceof Error ? err.message : 'Unknown IPC error',
                origin: 'makeIPCRequest',
                type: ErrorType.IPC_ERROR,
            })
        }
    }
}

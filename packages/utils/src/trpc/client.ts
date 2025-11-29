import type { RouterDef, ProcedureDefinition } from './procedure'
import { z } from 'zod'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface ClientConfig {
    baseUrl: string
    headers?: Record<string, string>
}

type InferProcedureClient<T> =
    T extends ProcedureDefinition<infer TInput, infer TOutput>
        ? {
              query: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>) => Promise<TOutput>
                  : () => Promise<TOutput>
              mutate: TInput extends z.ZodSchema
                  ? (input: z.infer<TInput>) => Promise<TOutput>
                  : () => Promise<TOutput>
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

                    return async (input?: any, method?: HttpMethod) => {
                        const procedureName = procedurePath.join('.')
                        const methodToUse = prop === 'query' ? 'GET' : method || 'POST'

                        let url = `${config.baseUrl}/${procedureName}`
                        if (methodToUse === 'GET' && input !== undefined) {
                            const params = new URLSearchParams()
                            params.set('input', JSON.stringify(input))
                            url += `?${params.toString()}`
                        }

                        //Make the fetch request
                        console.log({ procedureName, methodToUse, input, url })
                        const response = await fetch(url, {
                            method: methodToUse,
                            headers: {
                                'Content-Type': 'application/json',
                                ...config.headers,
                            },
                            body:
                                methodToUse !== 'GET' && input !== undefined
                                    ? JSON.stringify(input)
                                    : undefined,
                        })

                        if (!response.ok) {
                            const errorData = await response.json()
                            throw new Error(
                                `Error ${response.status}: ${errorData.error || response.statusText}`,
                            )
                        }

                        const data = await response.json()
                        return data.result
                    }
                },
            },
        )
    }
    return createProcedureProxy() as InferRouteClient<T>
}

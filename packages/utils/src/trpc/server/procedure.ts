import { z } from 'zod'
import { Store } from '../context/store'

export type ProcedureType = 'query' | 'mutation'

export interface ProcedureDefinition<
    TInput extends z.ZodSchema | undefined = z.ZodSchema | undefined,
    TOutput = any,
> {
    type: ProcedureType
    input?: TInput
    handler: (
        input: TInput extends z.ZodSchema ? z.infer<TInput> : void,
    ) => Promise<TOutput> | TOutput
}

export interface RouterDef {
    [key: string]: ProcedureDefinition<any, any> | RouterDef
}

export function createRouter<T extends RouterDef>(def: T): T {
    return def
}

export const createProcedure = <TStores extends Record<string, Store<any, any>>>(
    storeObj: TStores = {} as TStores,
) => {
    return {
        input: <TInput extends z.ZodSchema>(schema: TInput) => {
            return {
                query: <TOutput>(
                    handler: ({
                        input,
                        store,
                    }: {
                        input: z.infer<TInput>
                        store: TStores
                    }) => Promise<TOutput> | TOutput,
                ): ProcedureDefinition<TInput, TOutput> =>
                    ({
                        type: 'query' as const,
                        input: schema,
                        handler: (input: z.infer<TInput>) => {
                            return handler({ input: input, store: storeObj })
                        },
                    }) as any,
                mutation: <TOutput>(
                    handler: ({
                        input,
                        store,
                    }: {
                        input: z.infer<TInput>
                        store: TStores
                    }) => Promise<TOutput> | TOutput,
                ): ProcedureDefinition<TInput, TOutput> =>
                    ({
                        type: 'mutation' as const,
                        input: schema,
                        handler: (input: z.infer<TInput>) => {
                            return handler({ input: input, store: storeObj })
                        },
                    }) as any,
            }
        },
        query: <TOutput>(
            handler: ({ store }: { store: TStores }) => Promise<TOutput> | TOutput,
        ): ProcedureDefinition<undefined, TOutput> =>
            ({
                type: 'query' as const,
                handler: () => handler({ store: storeObj }),
            }) as any,
        mutation: <TOutput>(
            handler: ({ store }: { store: TStores }) => Promise<TOutput> | TOutput,
        ): ProcedureDefinition<undefined, TOutput> =>
            ({
                type: 'mutation' as const,
                handler: () => handler({ store: storeObj }),
            }) as any,
    }
}

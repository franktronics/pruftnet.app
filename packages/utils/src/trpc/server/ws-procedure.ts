import { z } from 'zod'
import { Store } from '../context/store'

export interface WSProcedureDefinition<
    TInput extends z.ZodSchema | undefined = z.ZodSchema | undefined,
    TOutput = any,
> {
    input?: TInput
    handler: (
        input: TInput extends z.ZodSchema ? z.infer<TInput> : void,
        returnCb: (data: TOutput) => void,
    ) => Promise<void>
}

export interface WSRouterDef {
    [key: string]: WSProcedureDefinition<any, any> | WSRouterDef
}

export function createWsRouter<T extends WSRouterDef>(def: T): T {
    return def
}

export const createWsProcedure = <TStores extends Record<string, Store<any, any>>>(
    storeObj: TStores,
) => {
    return {
        input<TInput extends z.ZodSchema>(schema: TInput) {
            return {
                handle: <TOutput>(
                    handler: (
                        {
                            input,
                            store,
                        }: {
                            input: z.infer<TInput>
                            store: TStores
                        },
                        returnCb: (data: TOutput) => void,
                    ) => Promise<void>,
                ): WSProcedureDefinition<TInput, TOutput> =>
                    ({
                        input: schema,
                        handler: (input: z.infer<TInput>, returnCb: (data: TOutput) => void) => {
                            return handler({ input, store: storeObj }, returnCb)
                        },
                    }) as any,
            }
        },
        handle: <TOutput>(
            handler: (
                {
                    store,
                }: {
                    store: TStores
                },
                returnCb: (data: TOutput) => void,
            ) => Promise<void>,
        ): WSProcedureDefinition<undefined, TOutput> =>
            ({
                handler: (returnCb: (data: TOutput) => void) => {
                    return handler({ store: storeObj }, returnCb)
                },
            }) as any,
    }
}

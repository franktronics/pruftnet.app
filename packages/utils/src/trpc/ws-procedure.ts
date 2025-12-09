import { z } from 'zod'

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

export const wsProcedure = {
    input<TInput extends z.ZodSchema>(schema: TInput) {
        return {
            handle: <TOutput>(
                handler: (
                    input: z.infer<TInput>,
                    returnCb: (data: TOutput) => void,
                ) => Promise<void>,
            ): WSProcedureDefinition<TInput, TOutput> =>
                ({
                    input: schema,
                    handler: handler as any,
                }) as any,
        }
    },
    handle: <TOutput>(
        handler: (returnCb: (data: TOutput) => void) => Promise<void>,
    ): WSProcedureDefinition<undefined, TOutput> =>
        ({
            handler: handler as any,
        }) as any,
}

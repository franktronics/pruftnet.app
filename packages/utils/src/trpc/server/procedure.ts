import { z } from 'zod'

export type ProcedureType = 'query' | 'mutation'

export interface ProcedureDefinition<
    TInput extends z.ZodSchema | undefined = z.ZodSchema | undefined,
    TOutput = any,
> {
    type: ProcedureType
    input?: TInput
    handler: (
        input: TInput extends z.ZodSchema ? z.infer<TInput> : void,
        ctx?: any,
    ) => Promise<TOutput> | TOutput
}

export interface RouterDef {
    [key: string]: ProcedureDefinition<any, any> | RouterDef
}

export function createRouter<T extends RouterDef>(def: T): T {
    return def
}

export const procedure = {
    input<TInput extends z.ZodSchema>(schema: TInput) {
        return {
            query: <TOutput>(
                handler: (input: z.infer<TInput>, ctx?: any) => Promise<TOutput> | TOutput,
            ): ProcedureDefinition<TInput, TOutput> =>
                ({
                    type: 'query' as const,
                    input: schema,
                    handler: handler as any,
                }) as any,
            mutation: <TOutput>(
                handler: (input: z.infer<TInput>, ctx?: any) => Promise<TOutput> | TOutput,
            ): ProcedureDefinition<TInput, TOutput> =>
                ({
                    type: 'mutation' as const,
                    input: schema,
                    handler: handler as any,
                }) as any,
        }
    },
    query: <TOutput>(
        handler: (ctx?: any) => Promise<TOutput> | TOutput,
    ): ProcedureDefinition<undefined, TOutput> =>
        ({
            type: 'query' as const,
            handler: handler as any,
        }) as any,
    mutation: <TOutput>(
        handler: (ctx?: any) => Promise<TOutput> | TOutput,
    ): ProcedureDefinition<undefined, TOutput> =>
        ({
            type: 'mutation' as const,
            handler: handler as any,
        }) as any,
}

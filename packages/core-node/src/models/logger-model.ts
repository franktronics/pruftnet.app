import { z } from 'zod'

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])
export const logSourceSchema = z.enum(['frontend', 'backend'])

export const logInputSchema = z.object({
    level: logLevelSchema,
    source: logSourceSchema,
    title: z.string().min(1),
    message: z.string().min(1),
    context: z.unknown().optional(),
})

export type LogLevel = z.infer<typeof logLevelSchema>
export type LogSource = z.infer<typeof logSourceSchema>
export type LogInput = z.infer<typeof logInputSchema>

export const logFilterSchema = z.object({
    level: logLevelSchema.optional(),
    source: logSourceSchema.optional(),
    take: z.number().int().positive().max(500).optional(),
    skip: z.number().int().nonnegative().optional(),
})

export type LogFilter = z.infer<typeof logFilterSchema>

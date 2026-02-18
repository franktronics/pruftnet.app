import { z } from 'zod'

export const settingsSchema = z.object({
    maxPacketBufferSize: z.number().min(1000).max(1000000),
    promiscuousMode: z.boolean(),
    protocolEntryFile: z.string(),
    defaultCaptureTab: z.enum(['graph', 'scan']),
    connectionLineType: z.enum(['bezier', 'straight', 'step']),
})

export type AppSettings = z.infer<typeof settingsSchema>

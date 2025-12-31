import { z } from 'zod'

export const settingsSchema = z.object({
    maxPacketBufferSize: z.number().min(1000).max(1000000),
    promiscuousMode: z.boolean(),
    protocolEntryFile: z.string(),
})

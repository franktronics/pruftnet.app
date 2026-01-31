import { z } from 'zod'
import { type GraphNode } from '../node'

const packetEntrySchema = z.object({
    packet: z.custom<Buffer>((value) => Buffer.isBuffer(value), {
        message: 'Expected Buffer',
    }),
    delay: z.number().int().min(0),
})

const inputSchema = z.object({
    packets: z.array(packetEntrySchema),
})

const outputSchema = z.array(packetEntrySchema)

type NetOutputInput = z.infer<typeof inputSchema>
type NetOutputOutput = z.infer<typeof outputSchema>

export const networkOutputNode: GraphNode<NetOutputInput, NetOutputOutput> = {
    type: 'net-output',
    inputSchema,
    outputSchema,
    mergeInputs(inputs: unknown[]): NetOutputInput {
        const filtered = inputs.filter((v) => v !== undefined)
        if (filtered.length === 0) {
            throw new Error('net-output requires at least one input')
        }

        const packets: z.infer<typeof packetEntrySchema>[] = []
        for (const entry of filtered) {
            if (Array.isArray(entry)) {
                packets.push(...(entry as z.infer<typeof packetEntrySchema>[]))
            } else if (typeof entry === 'object' && entry !== null && 'packets' in entry) {
                const casted = (entry as { packets?: unknown }).packets
                if (Array.isArray(casted)) {
                    packets.push(...(casted as z.infer<typeof packetEntrySchema>[]))
                }
            }
        }

        return { packets }
    },
    run(input: NetOutputInput): NetOutputOutput {
        return outputSchema.parse(input.packets)
    },
}

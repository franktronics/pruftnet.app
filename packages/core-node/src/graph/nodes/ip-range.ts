import { z } from 'zod'
import { type GraphNode } from '../node'

const ipTupleSchema = z.tuple([
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
    z.number().int().min(0).max(255),
])

const outputSchema = z.object({
    start: ipTupleSchema,
    end: ipTupleSchema,
})

type IpRangeOutput = z.infer<typeof outputSchema>

export const ipRangeNode: GraphNode<undefined, IpRangeOutput> = {
    type: 'ip-range',
    inputSchema: z.undefined(),
    outputSchema,
    mergeInputs() {
        return undefined as never
    },
    run(_, nodeData: unknown) {
        return outputSchema.parse(nodeData)
    },
}

import { z } from 'zod'
import type { WorkflowContext, WorkflowStep, WorkflowStepInput, WorkflowStepOutput } from '../workflow-step'

const ipRangeSchema = z.object({
    startIp: z.string().min(1),
    endIp: z.string().min(1),
})

export class IpRangeStep implements WorkflowStep {
    readonly type = 'ip-range'

    async execute(
        context: WorkflowContext,
        input: WorkflowStepInput,
    ): Promise<WorkflowStepOutput> {
        const data = ipRangeSchema.parse(input.node.data ?? {})
        return { output: [data.startIp, data.endIp] }
    }
}

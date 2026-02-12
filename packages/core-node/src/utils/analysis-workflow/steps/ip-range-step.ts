import { z } from 'zod'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const ipRangeSchema = z.object({
    startIp: z.string().min(1),
    endIp: z.string().min(1),
})

export class IpRangeStep implements WorkflowStep {
    readonly type = 'ip-range'

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = ipRangeSchema.parse(input.node.data ?? {})
        const startIp = this.parseIp(data.startIp)
        const endIp = this.parseIp(data.endIp)
        return { output: [startIp, endIp] }
    }

    private parseIp(ip: string): number[] {
        const parts = ip.split('.').map((part) => Number(part))
        if (
            parts.length !== 4 ||
            parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
        ) {
            throw new Error(`Invalid IP address format: ${ip}`)
        }
        return parts
    }
}

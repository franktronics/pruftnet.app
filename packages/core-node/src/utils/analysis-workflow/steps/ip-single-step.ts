import { z } from 'zod'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const ipSingleSchema = z.object({
    ipAddress: z.string().min(1),
})

export class IpSingleStep implements WorkflowStep {
    readonly type = 'ip-single'

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = ipSingleSchema.parse(input.node.data ?? {})
        const ip = this.parseIp(data.ipAddress)
        return { output: ip }
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

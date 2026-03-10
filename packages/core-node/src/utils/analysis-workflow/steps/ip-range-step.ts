import { z } from 'zod'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const ipAddressSchema = z
    .string()
    .regex(/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/, 'Invalid IP address format')
const ipRangeSchema = z.object({
    startIp: ipAddressSchema,
    endIp: ipAddressSchema,
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

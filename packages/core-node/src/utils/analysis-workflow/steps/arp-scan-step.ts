import { z } from 'zod'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const arpScanSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
})

export class ArpScanStep implements WorkflowStep {
    readonly type = 'arp-scan'

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = arpScanSchema.parse(input.node.data ?? {})
        const [startIp, endIp] = this.extractIpRange(input.inputs)
        const addresses = this.buildIpRange(startIp, endIp)
        const delay = data.delay ?? 0
        const packets: Array<Buffer | { delay: number }> = []

        for (let i = 0; i < addresses.length; i += 1) {
            const address = addresses[i]
            packets.push(this.fakeArpPacket(address || ''))
            if (delay > 0 && i < addresses.length - 1) {
                packets.push({ delay })
            }
        }

        return { output: packets }
    }

    private extractIpRange(inputs: Record<string, unknown>): [string, string] {
        for (const value of Object.values(inputs)) {
            if (Array.isArray(value) && value.length === 2) {
                const [start, end] = value
                if (typeof start === 'string' && typeof end === 'string') {
                    return [start, end]
                }
            }
        }
        throw new Error('Missing IP range input for arp-scan node')
    }

    private buildIpRange(startIp: string, endIp: string): string[] {
        const start = this.ipToNumber(startIp)
        const end = this.ipToNumber(endIp)

        if (start > end) {
            throw new Error('Invalid IP range: start is greater than end')
        }

        const result: string[] = []
        for (let current = start; current <= end; current += 1) {
            result.push(this.numberToIp(current))
        }
        return result
    }

    private ipToNumber(ip: string): number {
        const parts = ip.split('.').map((part) => Number(part))
        if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
            throw new Error(`Invalid IP address: ${ip}`)
        }
        return (
            ((parts[0] ?? 0 << 24) >>> 0) +
            ((parts[1] ?? 0 << 16) >>> 0) +
            ((parts[2] ?? 0 << 8) >>> 0) +
            (parts[3] ?? 0 >>> 0)
        )
    }

    private numberToIp(value: number): string {
        return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join(
            '.',
        )
    }

    private fakeArpPacket(destinationIp: string): Buffer {
        return Buffer.from(`arp:${destinationIp}`)
    }
}

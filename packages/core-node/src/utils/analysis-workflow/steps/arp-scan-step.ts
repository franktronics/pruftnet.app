import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const arpScanSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
})

class NetworkInterfaceValidator {
    validate(interfaceName: unknown): void {
        if (typeof interfaceName !== 'string' || interfaceName.trim() === '') {
            throw new Error('Interface name must be a non-empty string')
        }

        const interfaces = networkInterfaces()
        const targetInterface = interfaces[interfaceName]

        if (!targetInterface) {
            throw new Error(`Network interface "${interfaceName}" not found`)
        }

        const hasInternalOnly = targetInterface.every((info) => info.internal === true)

        if (hasInternalOnly) {
            throw new Error(
                `Network interface "${interfaceName}" is a loopback interface and cannot be used for ARP scanning`,
            )
        }
    }
}

class ArpIpRangeValidator {
    validate(inputs: Record<string, unknown>): number[][] {
        const ranges = this.extractIpRanges(inputs)
        const allValidIps: number[][] = []

        for (const [startIp, endIp] of ranges) {
            this.validateIpFormat(startIp)
            this.validateIpFormat(endIp)
            this.validateRangeOrder(startIp, endIp)
            const validIps = this.filterValidArpTargets(startIp, endIp)
            allValidIps.push(...validIps)
        }

        this.ensureNonEmptyRange(allValidIps)
        return allValidIps
    }

    private extractIpRanges(inputs: Record<string, unknown>): Array<[number[], number[]]> {
        const ranges: Array<[number[], number[]]> = []

        for (const value of Object.values(inputs)) {
            if (!Array.isArray(value) || value.length !== 2) continue
            const [start, end] = value
            if (!Array.isArray(start) || start.length !== 4) continue
            if (!Array.isArray(end) || end.length !== 4) continue
            ranges.push([start as number[], end as number[]])
        }

        if (ranges.length === 0) {
            throw new Error('Missing IP range input for arp-scan node')
        }

        return ranges
    }

    private validateIpFormat(ip: number[]): void {
        for (const octet of ip) {
            if (typeof octet !== 'number' || octet < 0 || octet > 255 || !Number.isInteger(octet)) {
                throw new Error(`Invalid IP octet: ${octet}. Must be an integer between 0 and 255`)
            }
        }
    }

    private validateRangeOrder(startIp: number[], endIp: number[]): void {
        const startNum = this.ipToNumber(startIp)
        const endNum = this.ipToNumber(endIp)
        if (startNum > endNum) {
            throw new Error('Invalid IP range: start is greater than end')
        }
    }

    private filterValidArpTargets(startIp: number[], endIp: number[]): number[][] {
        const startNum = this.ipToNumber(startIp)
        const endNum = this.ipToNumber(endIp)
        const validIps: number[][] = []

        for (let current = startNum; current <= endNum; current += 1) {
            const ip = this.numberToIp(current)
            this.ensureValidArpTarget(ip)
            validIps.push(ip)
        }

        return validIps
    }

    private ensureNonEmptyRange(validIps: number[][]): void {
        if (validIps.length === 0) {
            throw new Error('IP range contains no valid ARP targets')
        }
    }

    private ensureValidArpTarget(ip: number[]): void {
        const lastOctet = ip[3] ?? 0
        if (lastOctet === 0) {
            throw new Error(
                `Invalid ARP target: ${ip.join('.')} is a network address and cannot be used`,
            )
        }
        if (lastOctet === 255) {
            throw new Error(
                `Invalid ARP target: ${ip.join('.')} is a broadcast address and cannot be used`,
            )
        }
    }

    private ipToNumber(ip: number[]): number {
        return (
            (((ip[0] ?? 0) << 24) >>> 0) |
            (((ip[1] ?? 0) << 16) >>> 0) |
            (((ip[2] ?? 0) << 8) >>> 0) |
            ((ip[3] ?? 0) >>> 0)
        )
    }

    private numberToIp(value: number): number[] {
        return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
    }
}

export class ArpScanStep implements WorkflowStep {
    readonly type = 'arp-scan'
    private readonly ipValidator = new ArpIpRangeValidator()
    private readonly interfaceValidator = new NetworkInterfaceValidator()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = arpScanSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0

        this.interfaceValidator.validate(context.interface)
        const validAddresses = this.ipValidator.validate(input.inputs)

        const packets: Array<Buffer | { delay: number }> = []
        for (let i = 0; i < validAddresses.length; i += 1) {
            const address = validAddresses[i]
            if (!address) continue
            packets.push(Buffer.from(`arp:${address.join('.')}`))
            if (delay > 0 && i < validAddresses.length - 1) {
                packets.push({ delay })
            }
        }

        return { output: packets }
    }
}

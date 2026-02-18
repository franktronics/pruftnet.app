import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const icmpPingSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
    identifier: z.number().min(0).max(65535).optional(),
    sequenceStart: z.number().min(0).max(65535).optional(),
    dataSize: z.number().min(0).max(1472).optional(),
})

class IcmpPacketBuilder {
    private currentSequence: number

    constructor(sequenceStart: number = 1) {
        this.currentSequence = sequenceStart
    }

    build(identifier: number, dataSize: number): Buffer {
        const icmpHeader = this.buildIcmpHeader(identifier)
        const icmpData = this.buildIcmpData(dataSize)
        const packet = Buffer.concat([icmpHeader, icmpData])

        const checksum = this.calculateChecksum(packet)
        packet.writeUInt16BE(checksum, 2)

        return packet
    }

    private buildIcmpHeader(identifier: number): Buffer {
        const header = Buffer.alloc(8)
        header.writeUInt8(8, 0)
        header.writeUInt8(0, 1)
        header.writeUInt16BE(0, 2)
        header.writeUInt16BE(identifier, 4)
        header.writeUInt16BE(this.currentSequence++, 6)
        return header
    }

    private buildIcmpData(size: number): Buffer {
        const data = Buffer.alloc(size)
        const timestamp = Date.now()
        if (size >= 8) {
            data.writeBigUInt64BE(BigInt(timestamp), 0)
        }
        for (let i = 8; i < size; i += 1) {
            data.writeUInt8(0x20 + (i % 95), i)
        }
        return data
    }

    private calculateChecksum(buffer: Buffer): number {
        let sum = 0
        for (let i = 0; i < buffer.length; i += 2) {
            const word = i + 1 < buffer.length ? buffer.readUInt16BE(i) : (buffer[i] ?? 0) << 8
            sum += word
        }
        while (sum >> 16) {
            sum = (sum & 0xffff) + (sum >> 16)
        }
        return ~sum & 0xffff
    }
}

class NetworkInterfaceValidator {
    validate(interfaceName: unknown): { interface: string; ip: string } {
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
                `Network interface "${interfaceName}" is a loopback interface and cannot be used for ICMP ping`,
            )
        }

        const validInfo = targetInterface.find((info) => info.family === 'IPv4' && !info.internal)
        if (!validInfo) {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid IPv4 address for ICMP ping`,
            )
        }

        return {
            interface: interfaceName,
            ip: validInfo.address,
        }
    }
}

class IcmpIpInputValidator {
    validate(inputs: Record<string, unknown>): number[][] {
        const allValidIps: number[][] = []

        for (const value of Object.values(inputs)) {
            if (this.isIpRange(value)) {
                const range = value as [number[], number[]]
                const [startIp, endIp] = range
                this.validateIpFormat(startIp)
                this.validateIpFormat(endIp)
                this.validateRangeOrder(startIp, endIp)
                const validIps = this.expandIpRange(startIp, endIp)
                allValidIps.push(...validIps)
            } else if (this.isIpSingleton(value)) {
                const ip = value as number[]
                this.validateIpFormat(ip)
                allValidIps.push(ip)
            }
        }

        this.ensureNonEmptyRange(allValidIps)
        return allValidIps
    }

    private isIpRange(value: unknown): boolean {
        if (!Array.isArray(value) || value.length !== 2) return false
        const [start, end] = value
        return Array.isArray(start) && start.length === 4 && Array.isArray(end) && end.length === 4
    }

    private isIpSingleton(value: unknown): boolean {
        return Array.isArray(value) && value.length === 4
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

    private expandIpRange(startIp: number[], endIp: number[]): number[][] {
        const startNum = this.ipToNumber(startIp)
        const endNum = this.ipToNumber(endIp)
        const validIps: number[][] = []

        for (let current = startNum; current <= endNum; current += 1) {
            const ip = this.numberToIp(current)
            validIps.push(ip)
        }

        return validIps
    }

    private ensureNonEmptyRange(validIps: number[][]): void {
        if (validIps.length === 0) {
            throw new Error('IP range contains no valid ping targets')
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

export class IcmpPingStep implements WorkflowStep {
    readonly type = 'icmp-ping'
    private readonly ipValidator = new IcmpIpInputValidator()
    private readonly interfaceValidator = new NetworkInterfaceValidator()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = icmpPingSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0
        const identifier = data.identifier ?? this.generateRandomIdentifier()
        const sequenceStart = data.sequenceStart ?? 1
        const dataSize = data.dataSize ?? 32

        const interfaceData = this.interfaceValidator.validate(context.interface)
        const sourceIp = interfaceData.ip
        const validAddresses = this.ipValidator.validate(input.inputs)

        const packetBuilder = new IcmpPacketBuilder(sequenceStart)
        const packets: Array<{ packet: Buffer; targetIp: string } | { delay: number }> = []

        for (let i = 0; i < validAddresses.length; i += 1) {
            const targetIp = validAddresses[i]
            if (!targetIp) continue

            const icmpPacket = packetBuilder.build(identifier, dataSize)
            const targetIpString = targetIp.join('.')

            packets.push({
                packet: icmpPacket,
                targetIp: targetIpString,
            })

            if (delay > 0 && i < validAddresses.length - 1) {
                packets.push({ delay })
            }
        }

        return {
            output: {
                packets,
                ipSource: sourceIp,
                type: this.type,
            },
        }
    }

    private generateRandomIdentifier(): number {
        return Math.floor(Math.random() * 65536)
    }
}

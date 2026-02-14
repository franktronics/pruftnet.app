import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const icmpv6PingSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
    identifier: z.number().min(0).max(65535).optional(),
    sequenceStart: z.number().min(0).max(65535).optional(),
    dataSize: z.number().min(0).max(1232).optional(),
})

class Icmpv6EchoRequestBuilder {
    private currentSequence: number

    constructor(sequenceStart: number = 1) {
        this.currentSequence = sequenceStart
    }

    build(identifier: number, dataSize: number): Buffer {
        const icmpv6Header = this.buildIcmpv6Header(identifier)
        const icmpv6Data = this.buildIcmpv6Data(dataSize)
        const packet = Buffer.concat([icmpv6Header, icmpv6Data])

        return packet
    }

    private buildIcmpv6Header(identifier: number): Buffer {
        const header = Buffer.alloc(8)
        header.writeUInt8(128, 0)
        header.writeUInt8(0, 1)
        header.writeUInt16BE(0, 2)
        header.writeUInt16BE(identifier, 4)
        header.writeUInt16BE(this.currentSequence++, 6)
        return header
    }

    private buildIcmpv6Data(size: number): Buffer {
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
}

class NetworkInterfaceIpv6Validator {
    validate(interfaceName: unknown): { interface: string; ipv6: string; mac: string } {
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
                `Network interface "${interfaceName}" is a loopback interface and cannot be used for ICMPv6 ping`,
            )
        }

        const validInfo = targetInterface.find((info) => info.family === 'IPv6' && !info.internal)
        if (!validInfo) {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid IPv6 address for ICMPv6 ping`,
            )
        }

        if (!validInfo.mac || validInfo.mac === '00:00:00:00:00:00') {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid MAC address`,
            )
        }

        return {
            interface: interfaceName,
            ipv6: validInfo.address.split('%')[0] ?? validInfo.address,
            mac: validInfo.mac,
        }
    }
}

class Ipv6InputValidator {
    validate(inputs: Record<string, unknown>): string[] {
        const allValidIpv6: string[] = []

        for (const value of Object.values(inputs)) {
            if (this.isIpv6String(value)) {
                allValidIpv6.push(value)
            }
        }

        this.ensureNonEmpty(allValidIpv6)
        return allValidIpv6
    }

    private isIpv6String(value: unknown): value is string {
        return typeof value === 'string' && value.trim().length > 0
    }

    private ensureNonEmpty(validIpv6: string[]): void {
        if (validIpv6.length === 0) {
            throw new Error('No valid IPv6 addresses found in inputs')
        }
    }
}

export class Icmpv6PingStep implements WorkflowStep {
    readonly type = 'icmpv6-ping'
    private readonly ipv6Validator = new Ipv6InputValidator()
    private readonly interfaceValidator = new NetworkInterfaceIpv6Validator()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = icmpv6PingSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0
        const identifier = data.identifier ?? this.generateRandomIdentifier()
        const sequenceStart = data.sequenceStart ?? 1
        const dataSize = data.dataSize ?? 32

        const interfaceData = this.interfaceValidator.validate(context.interface)
        const sourceIpv6 = interfaceData.ipv6
        const validAddresses = this.ipv6Validator.validate(input.inputs)

        const packetBuilder = new Icmpv6EchoRequestBuilder(sequenceStart)
        const packets: Array<{ packet: Buffer; targetIpv6: string } | { delay: number }> = []

        for (let i = 0; i < validAddresses.length; i += 1) {
            const targetIpv6 = validAddresses[i]
            if (!targetIpv6) continue

            const icmpv6Packet = packetBuilder.build(identifier, dataSize)

            packets.push({
                packet: icmpv6Packet,
                targetIpv6: targetIpv6,
            })

            if (delay > 0 && i < validAddresses.length - 1) {
                packets.push({ delay })
            }
        }

        return {
            output: {
                packets,
                ipSource: sourceIpv6,
                type: this.type,
            },
        }
    }

    private generateRandomIdentifier(): number {
        return Math.floor(Math.random() * 65536)
    }
}

import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const ipv6NsSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
})

class Ipv6NsPacketBuilder {
    build(targetIpv6: string, sourceMac: string): Buffer {
        const packet = Buffer.alloc(32)

        packet.writeUInt8(135, 0)
        packet.writeUInt8(0, 1)
        packet.writeUInt16BE(0, 2)

        packet.writeUInt32BE(0, 4)

        const targetIpv6Bytes = this.ipv6ToBytes(targetIpv6)
        targetIpv6Bytes.copy(packet, 8)

        packet.writeUInt8(1, 24)
        packet.writeUInt8(1, 25)

        const macBytes = this.macToBytes(sourceMac)
        macBytes.copy(packet, 26)

        return packet
    }

    private ipv6ToBytes(ipv6: string): Buffer {
        const buffer = Buffer.alloc(16)
        const parts = this.expandIpv6(ipv6).split(':')

        for (let i = 0; i < 8; i += 1) {
            const value = parseInt(parts[i] ?? '0', 16)
            buffer.writeUInt16BE(value, i * 2)
        }

        return buffer
    }

    private expandIpv6(ipv6: string): string {
        if (ipv6.includes('::')) {
            const [left, right] = ipv6.split('::')
            const leftParts = left ? left.split(':') : []
            const rightParts = right ? right.split(':') : []
            const missingParts = 8 - leftParts.length - rightParts.length
            const middleParts = Array(missingParts).fill('0')
            return [...leftParts, ...middleParts, ...rightParts].join(':')
        }
        return ipv6
    }

    private macToBytes(mac: string): Buffer {
        const cleanMac = mac.replace(/[:-]/g, '')
        const buffer = Buffer.alloc(6)

        for (let i = 0; i < 6; i += 1) {
            const byte = cleanMac.substring(i * 2, i * 2 + 2)
            buffer.writeUInt8(parseInt(byte, 16), i)
        }

        return buffer
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
                `Network interface "${interfaceName}" is a loopback interface and cannot be used for IPv6 NS`,
            )
        }

        const validInfo = targetInterface.find((info) => info.family === 'IPv6' && !info.internal)
        if (!validInfo) {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid IPv6 address for NS`,
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

export class Ipv6NsStep implements WorkflowStep {
    readonly type = 'ipv6-ns'
    private readonly ipv6Validator = new Ipv6InputValidator()
    private readonly interfaceValidator = new NetworkInterfaceIpv6Validator()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = ipv6NsSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0

        const interfaceData = this.interfaceValidator.validate(context.interface)
        const sourceMac = interfaceData.mac
        const validAddresses = this.ipv6Validator.validate(input.inputs)

        const packetBuilder = new Ipv6NsPacketBuilder()
        const packets: Array<{ packet: Buffer; targetIpv6: string } | { delay: number }> = []

        for (let i = 0; i < validAddresses.length; i += 1) {
            const targetIpv6 = validAddresses[i]
            if (!targetIpv6) continue

            const nsPacket = packetBuilder.build(targetIpv6, sourceMac)

            packets.push({
                packet: nsPacket,
                targetIpv6: targetIpv6,
            })

            if (delay > 0 && i < validAddresses.length - 1) {
                packets.push({ delay })
            }
        }

        return {
            output: {
                packets,
                type: this.type,
            },
        }
    }
}

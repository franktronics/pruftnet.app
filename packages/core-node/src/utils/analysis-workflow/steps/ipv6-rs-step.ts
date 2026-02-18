import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'

const ipv6RsSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
})

class Ipv6RsPacketBuilder {
    build(sourceMac: string): Buffer {
        const packet = Buffer.alloc(16)

        packet.writeUInt8(133, 0)
        packet.writeUInt8(0, 1)
        packet.writeUInt16BE(0, 2)

        packet.writeUInt32BE(0, 4)

        packet.writeUInt8(1, 8)
        packet.writeUInt8(1, 9)

        const macBytes = this.macToBytes(sourceMac)
        macBytes.copy(packet, 10)

        return packet
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
                `Network interface "${interfaceName}" is a loopback interface and cannot be used for IPv6 RS`,
            )
        }

        const validInfo = targetInterface.find((info) => info.family === 'IPv6' && !info.internal)
        if (!validInfo) {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid IPv6 address for RS`,
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

export class Ipv6RsStep implements WorkflowStep {
    readonly type = 'ipv6-rs'
    private readonly interfaceValidator = new NetworkInterfaceIpv6Validator()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = ipv6RsSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0

        const interfaceData = this.interfaceValidator.validate(context.interface)
        const sourceMac = interfaceData.mac

        const packetBuilder = new Ipv6RsPacketBuilder()
        const rsPacket = packetBuilder.build(sourceMac)

        const packets: Array<{ packet: Buffer } | { delay: number }> = [{ packet: rsPacket }]

        if (delay > 0) {
            packets.push({ delay })
        }

        return {
            output: {
                packets,
                type: this.type,
            },
        }
    }
}

import { z } from 'zod'
import { networkInterfaces } from 'node:os'
import type {
    WorkflowContext,
    WorkflowStep,
    WorkflowStepInput,
    WorkflowStepOutput,
} from '../workflow-step'
import { TypeConverter } from '../../common/type-converter'

const arpScanSchema = z.object({
    delay: z.number().min(0).max(5000).optional(),
})

class ArpPacketBuilder {
    build(senderMac: number[], senderIp: number[], targetIp: number[]): Buffer {
        const ethernetHeader = this.buildEthernetHeader(senderMac)
        const arpPayload = this.buildArpPayload(senderMac, senderIp, targetIp)
        return Buffer.concat([ethernetHeader, arpPayload])
    }

    private buildEthernetHeader(senderMac: number[]): Buffer {
        const header = Buffer.alloc(14)
        const destinationMac = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
        const etherType = TypeConverter.uint16ToBytes(0x0806)

        destinationMac.forEach((byte, i) => header.writeUInt8(byte, i))
        senderMac.forEach((byte, i) => header.writeUInt8(byte, i + 6))
        etherType.forEach((byte, i) => header.writeUInt8(byte, i + 12))

        return header
    }

    private buildArpPayload(senderMac: number[], senderIp: number[], targetIp: number[]): Buffer {
        const payload = Buffer.alloc(28)
        const hardwareType = TypeConverter.uint16ToBytes(0x0001)
        const protocolType = TypeConverter.uint16ToBytes(0x0800)
        const hardwareAddressLength = 0x06
        const protocolAddressLength = 0x04
        const operation = TypeConverter.uint16ToBytes(0x0001)
        const targetMac = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00]

        let offset = 0
        hardwareType.forEach((byte) => payload.writeUInt8(byte, offset++))
        protocolType.forEach((byte) => payload.writeUInt8(byte, offset++))
        payload.writeUInt8(hardwareAddressLength, offset++)
        payload.writeUInt8(protocolAddressLength, offset++)
        operation.forEach((byte) => payload.writeUInt8(byte, offset++))
        senderMac.forEach((byte) => payload.writeUInt8(byte, offset++))
        senderIp.forEach((byte) => payload.writeUInt8(byte, offset++))
        targetMac.forEach((byte) => payload.writeUInt8(byte, offset++))
        targetIp.forEach((byte) => payload.writeUInt8(byte, offset++))

        return payload
    }
}

class NetworkInterfaceValidator {
    validate(interfaceName: unknown): { interface: string; mac: string; ip: string } {
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

        const validInfo = targetInterface.find(
            (info) => info.family === 'IPv4' && !info.internal && !!info.mac,
        )
        if (!validInfo) {
            throw new Error(
                `Network interface "${interfaceName}" does not have a valid IPv4 address or MAC address for ARP scanning`,
            )
        }

        return {
            interface: interfaceName,
            mac: validInfo.mac,
            ip: validInfo.address,
        }
    }
}

class ArpIpInputValidator {
    validate(inputs: Record<string, unknown>): number[][] {
        const allValidIps: number[][] = []

        for (const value of Object.values(inputs)) {
            if (this.isIpRange(value)) {
                const range = value as [number[], number[]]
                const [startIp, endIp] = range
                this.validateIpFormat(startIp)
                this.validateIpFormat(endIp)
                this.validateRangeOrder(startIp, endIp)
                const validIps = this.filterValidArpTargets(startIp, endIp)
                allValidIps.push(...validIps)
            } else if (this.isIpSingleton(value)) {
                const ip = value as number[]
                this.validateIpFormat(ip)
                this.ensureValidArpTarget(ip)
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
    private readonly ipValidator = new ArpIpInputValidator()
    private readonly interfaceValidator = new NetworkInterfaceValidator()
    private readonly packetBuilder = new ArpPacketBuilder()

    async execute(context: WorkflowContext, input: WorkflowStepInput): Promise<WorkflowStepOutput> {
        const data = arpScanSchema.parse(input.node.data ?? {})
        const delay = data.delay ?? 0

        const interfaceData = this.interfaceValidator.validate(context.interface)
        const senderMac = TypeConverter.macStringToBytes(interfaceData.mac)
        const senderIp = TypeConverter.ipStringToBytes(interfaceData.ip)
        const validAddresses = this.ipValidator.validate(input.inputs)

        const packets: Array<Buffer | { delay: number }> = []
        for (let i = 0; i < validAddresses.length; i += 1) {
            const targetIp = validAddresses[i]
            if (!targetIp) continue
            const arpPacket = this.packetBuilder.build(senderMac, senderIp, targetIp)
            packets.push(arpPacket)
            if (delay > 0 && i < validAddresses.length - 1) {
                packets.push({ delay })
            }
        }

        return { output: { packets, type: this.type } }
    }
}

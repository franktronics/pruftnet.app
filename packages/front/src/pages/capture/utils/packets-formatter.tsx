import type { PacketDataWithoutRaw, ProtocolFileData } from '@repo/core-node/types'

export abstract class PacketFormater {
    public abstract getTime(): string
    public abstract getSource(): string
    public abstract getDestination(): string
    public abstract getProtocol(): string
    public abstract getLength(): string
    public abstract getInfo(): string
}

class DefaultPacketFormater extends PacketFormater {
    private packet: PacketDataWithoutRaw
    private lastProtocolFile: ProtocolFileData | undefined = undefined

    constructor(packet: PacketDataWithoutRaw, file: ProtocolFileData | undefined) {
        super()
        this.lastProtocolFile = file
        this.packet = packet
    }

    private formatMacAddress(value: string | number | bigint): string {
        const num = BigInt(value)
        const hex = num.toString(16).padStart(12, '0')
        return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? '00:00:00:00:00:00'
    }

    private formatIpv4Address(value: string | number | bigint): string {
        const num = Number(value)
        const octet1 = (num >>> 24) & 0xff
        const octet2 = (num >>> 16) & 0xff
        const octet3 = (num >>> 8) & 0xff
        const octet4 = num & 0xff
        return `${octet1}.${octet2}.${octet3}.${octet4}`
    }

    private findFieldByPattern(
        layer: number,
        pattern: RegExp,
    ): string | number | bigint | undefined {
        const layerData = this.packet.parsed[layer]
        if (!layerData) return undefined

        const matchingKey = Object.keys(layerData).find((key) => pattern.test(key))
        return matchingKey ? layerData[matchingKey] : undefined
    }

    private hasIpv4Layer(): boolean {
        const etherType = this.findFieldByPattern(0, /^96_16_/)
        return etherType !== undefined && Number(etherType) === 0x0800
    }

    public getTime(): string {
        const time = this.packet.raw.timestamp
        return time.toString()
    }

    public getSource(): string {
        if (this.hasIpv4Layer()) {
            const sourceIp = this.findFieldByPattern(1, /^96_32_/)
            if (sourceIp !== undefined) {
                return this.formatIpv4Address(sourceIp)
            }
        }

        const sourceMac = this.findFieldByPattern(0, /^48_48_/)
        return sourceMac !== undefined ? this.formatMacAddress(sourceMac) : 'not found'
    }

    public getDestination(): string {
        if (this.hasIpv4Layer()) {
            const destIp = this.findFieldByPattern(1, /^128_32_/)
            if (destIp !== undefined) {
                return this.formatIpv4Address(destIp)
            }
        }

        const destMac = this.findFieldByPattern(0, /^0_48_/)
        return destMac !== undefined ? this.formatMacAddress(destMac) : 'not found'
    }

    public getProtocol(): string {
        if (!this.lastProtocolFile) {
            return 'Unknown'
        }
        return this.lastProtocolFile.content.name
    }

    public getLength(): string {
        const length = this.packet.raw.length
        return length.toString()
    }

    public getInfo(): string {
        if (!this.lastProtocolFile) {
            return 'Not found'
        }
        return this.lastProtocolFile.content.description
    }
}

export class PacketFormaterFactory {
    static create(
        packet: PacketDataWithoutRaw,
        lastProtocolFile: ProtocolFileData | undefined,
    ): PacketFormater {
        if (!lastProtocolFile) {
            return new DefaultPacketFormater(packet, undefined)
        }
        switch (lastProtocolFile.content.name) {
            default:
                return new DefaultPacketFormater(packet, lastProtocolFile)
        }
    }
}

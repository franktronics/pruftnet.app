import type { PacketDataForClient, ProtocolFileData } from '@repo/core-node/types'

export abstract class PacketFormater {
    public abstract getTime(): string
    public abstract getSource(): string
    public abstract getDestination(): string
    public abstract getProtocol(): string
    public abstract getLength(): string
    public abstract getInfo(): string
}

class DefaultPacketFormater extends PacketFormater {
    private packet: PacketDataForClient
    private lastProtocolFile: ProtocolFileData | undefined = undefined

    constructor(packet: PacketDataForClient, file: ProtocolFileData | undefined) {
        super()
        this.lastProtocolFile = file
        this.packet = packet
    }

    private formatMacAddress(value: string | number | bigint): string {
        const hex = value.toString(16).padStart(12, '0')
        return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? 'Invalid MAC'
    }

    public getTime(): string {
        const time = this.packet.raw.timestamp
        return time.toString()
    }

    public getSource(): string {
        const source = this.packet.parsed[0]['48_48']
        return source !== undefined ? this.formatMacAddress(source) : 'not found'
    }

    public getDestination(): string {
        const destination = this.packet.parsed[0]['0_48']
        return destination !== undefined ? this.formatMacAddress(destination) : 'not found'
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
        packet: PacketDataForClient,
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

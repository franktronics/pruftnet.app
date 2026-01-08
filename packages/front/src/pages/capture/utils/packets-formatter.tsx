import type { PacketDataForClient } from '@repo/core-node/types'

export class PacketFormater {
    constructor() {}

    private static formatMacAddress(value: number | bigint): string {
        const hex = value.toString(16).padStart(12, '0')
        return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? 'Invalid MAC'
    }

    static getTime(packet: PacketDataForClient): string {
        const time = packet.raw.timestamp
        return time.toString()
    }

    static getDestination(packet: PacketDataForClient): string {
        const destination = packet.parsed[0]['0_48']
        return destination !== undefined ? this.formatMacAddress(destination) : 'not found'
    }

    static getSource(packet: PacketDataForClient): string {
        const source = packet.parsed[0]['48_48']
        return source !== undefined ? this.formatMacAddress(source) : 'not found'
    }

    static getLength(packet: PacketDataForClient): string {
        const length = packet.raw.length
        return length.toString()
    }
}

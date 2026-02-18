import type { PacketDataWithoutRaw } from '@repo/core-node/types'

export class MacAddressExtractor {
    private formatMacAddress(value: string | number | bigint): string {
        const num = BigInt(value)
        const hex = num.toString(16).padStart(12, '0')
        return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? '00:00:00:00:00:00'
    }

    private findFieldByPattern(
        packet: PacketDataWithoutRaw,
        layer: number,
        pattern: RegExp,
    ): string | number | bigint | null {
        const layerData = packet.parsed[layer]
        if (!layerData) return null

        const matchingKey = Object.keys(layerData).find((key) => pattern.test(key))
        return matchingKey && layerData[matchingKey] !== undefined ? layerData[matchingKey] : null
    }

    public extractSourceMac(packet: PacketDataWithoutRaw): string | null {
        const sourceMac = this.findFieldByPattern(packet, 0, /^48_48_/)
        return sourceMac !== null ? this.formatMacAddress(sourceMac) : null
    }

    public extractDestinationMac(packet: PacketDataWithoutRaw): string | null {
        const destMac = this.findFieldByPattern(packet, 0, /^0_48_/)
        return destMac !== null ? this.formatMacAddress(destMac) : null
    }
}

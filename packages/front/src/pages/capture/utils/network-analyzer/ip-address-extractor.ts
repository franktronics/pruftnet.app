import type { PacketDataWithoutRaw } from '@repo/core-node/types'

export type IpAddresses = {
    sourceIpv4: string | null
    destIpv4: string | null
    sourceIpv6: string | null
    destIpv6: string | null
}

export class IpAddressExtractor {
    private formatIpv4Address(value: string | number | bigint): string {
        const num = Number(value)
        const octet1 = (num >>> 24) & 0xff
        const octet2 = (num >>> 16) & 0xff
        const octet3 = (num >>> 8) & 0xff
        const octet4 = num & 0xff
        return `${octet1}.${octet2}.${octet3}.${octet4}`
    }

    private formatIpv6Address(value: string | number | bigint): string {
        const num = BigInt(value)
        const hex = num.toString(16).padStart(32, '0')
        const groups = hex.match(/.{4}/g) ?? []
        return groups.join(':')
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

    private findIpLayer(packet: PacketDataWithoutRaw): number | null {
        for (let i = 0; i < packet.parsed.length; i++) {
            const file = packet.parsed[i]?.file
            if (file?.includes('ipv4.json') || file?.includes('ipv6.json')) {
                return i
            }
        }
        return null
    }

    public extractIpAddresses(packet: PacketDataWithoutRaw): IpAddresses {
        const result: IpAddresses = {
            sourceIpv4: null,
            destIpv4: null,
            sourceIpv6: null,
            destIpv6: null,
        }

        const ipLayer = this.findIpLayer(packet)
        if (ipLayer === null) return result

        const layerFile = packet.parsed[ipLayer]?.file

        if (layerFile?.includes('ipv4.json')) {
            const sourceIp = this.findFieldByPattern(packet, ipLayer, /^96_32_/)
            const destIp = this.findFieldByPattern(packet, ipLayer, /^128_32_/)

            if (sourceIp !== null) {
                result.sourceIpv4 = this.formatIpv4Address(sourceIp)
            }
            if (destIp !== null) {
                result.destIpv4 = this.formatIpv4Address(destIp)
            }
        } else if (layerFile?.includes('ipv6.json')) {
            const sourceIp = this.findFieldByPattern(packet, ipLayer, /^64_128_/)
            const destIp = this.findFieldByPattern(packet, ipLayer, /^192_128_/)

            if (sourceIp !== null) {
                result.sourceIpv6 = this.formatIpv6Address(sourceIp)
            }
            if (destIp !== null) {
                result.destIpv6 = this.formatIpv6Address(destIp)
            }
        }

        return result
    }
}

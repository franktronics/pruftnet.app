import type { ProtocolFileData, PacketData } from '@repo/core-node/types'

export type BlockDataType = {
    title: string
    size: number
    values: Array<{ name: string; value: string }>
}

export class DissectorValueFormatter {
    private protocolFile: Record<string, ProtocolFileData>
    private packet: PacketData | null

    constructor(protoFile: Record<string, ProtocolFileData>, packet: PacketData | null) {
        this.protocolFile = protoFile
        this.packet = packet
    }

    private formatMac(value: string | number | bigint): string {
        const num = BigInt(value)
        const hex = num.toString(16).padStart(12, '0')
        return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? '00:00:00:00:00:00'
    }

    private formatIpv4(value: string | number | bigint): string {
        const num = Number(value)
        const octet1 = (num >>> 24) & 0xff
        const octet2 = (num >>> 16) & 0xff
        const octet3 = (num >>> 8) & 0xff
        const octet4 = num & 0xff
        return `${octet1}.${octet2}.${octet3}.${octet4}`
    }

    private formatIpv6(value: string | number | bigint): string {
        const num = BigInt(value)
        const hex = num.toString(16).padStart(32, '0')
        const groups = hex.match(/.{4}/g) ?? []
        return groups.join(':')
    }

    private formatInt(value: string | number | bigint): string {
        return value.toString()
    }

    private formatHex(value: string | number | bigint): string {
        const num = BigInt(value)
        return '0x' + num.toString(16).toUpperCase()
    }

    private formatTimestamp(value: string | number | bigint): string {
        const timestamp = Number(value)
        return new Date(timestamp * 1000).toISOString()
    }

    private formatBytes(value: string | number | bigint): string {
        const num = BigInt(value)
        return num.toString(16).toUpperCase()
    }

    private formatValue(value: string | number | bigint, type: string): string {
        switch (type) {
            case 'mac':
                return this.formatMac(value)
            case 'ipv4':
                return this.formatIpv4(value)
            case 'ipv6':
                return this.formatIpv6(value)
            case 'int':
                return this.formatInt(value)
            case 'hex':
                return this.formatHex(value)
            case 'timestamp':
                return this.formatTimestamp(value)
            case 'bytes':
                return this.formatBytes(value)
            default:
                return String(value)
        }
    }

    public getBlockData(): BlockDataType[] {
        const blockData: BlockDataType[] = []
        if (!this.packet) return blockData

        for (const blocks of this.packet.parsed) {
            const protoFile = blocks.file ? this.protocolFile[blocks.file] : null
            if (!protoFile) {
                blockData.push({
                    title: 'Unknown Protocol',
                    size: 0,
                    values: [{ name: 'Data', value: 'N/A' }],
                })
                continue
            }

            let size = 0
            const blockValues: BlockDataType['values'] = []
            Object.entries(blocks).forEach(([key, value]) => {
                if (/^\d+_\d+_\d+$/.test(key) === false) {
                    return
                }
                const [start, length, _] = key.split('_')
                size += parseInt(length, 10)
                const fileBlock = protoFile.content.header[start + '_' + length]
                blockValues.push({
                    name: fileBlock?.description ?? 'Unknown Field',
                    value: this.formatValue(value, fileBlock?.type ?? 'bytes'),
                })
            })
            blockData.push({
                title: protoFile.content.description,
                size: size / 8,
                values: blockValues,
            })
        }

        return blockData
    }
}

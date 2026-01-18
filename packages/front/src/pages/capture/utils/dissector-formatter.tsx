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
                const fileKey = start + '_' + length
                blockValues.push({
                    name: protoFile.content.header[fileKey]?.description ?? 'Unknown Field',
                    value: String(value),
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

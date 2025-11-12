import { ParsedPacket } from '../types/basics'
import addon from '../addon'

/**
 * PacketParser class for parsing network packets
 */
export class PacketParser {
    private nativeInstance: any

    constructor() {
        this.nativeInstance = new addon.PacketParser()
    }

    /**
     * Parse packet data from raw bytes
     * @param data Raw packet data as Buffer or Uint8Array
     * @returns Parsed packet information with protocols and fields
     */
    parse(data: Buffer | Uint8Array): ParsedPacket {
        if (!data || data.length === 0) {
            throw new Error('Packet data cannot be empty')
        }

        return this.nativeInstance.parse(data)
    }
}

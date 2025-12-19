import type { ParsedPacket } from '../types/basics.js'
import addon from '../addon.js'

/**
 * PacketParser class for parsing raw network packet data
 *
 * Parses raw packet bytes into a compact binary format with protocol
 * layers and field offsets. Use this for parsing packets from pcap files
 * or other sources (for live capture, use NetworkSniffer which has
 * integrated parsing).
 *
 * @example
 * ```typescript
 * const parser = new PacketParser()
 *
 * // Parse a raw ethernet frame
 * const rawPacket = Buffer.from([
 *     0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,  // Destination MAC
 *     0x11, 0x22, 0x33, 0x44, 0x55, 0x66,  // Source MAC
 *     0x08, 0x00,                          // EtherType (IPv4)
 *     // ... rest of packet
 * ])
 *
 * const parsed = parser.parse(rawPacket)
 * console.log('Found', parsed.protocolCount, 'protocol layers')
 * ```
 */
export class PacketParser {
    private nativeInstance: InstanceType<typeof addon.PacketParser>

    constructor() {
        try {
            this.nativeInstance = new addon.PacketParser()
        } catch (error) {
            throw new Error(
                `Failed to create PacketParser: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * Parse raw packet data into structured protocol information
     *
     * @param data Raw packet bytes (starting from Ethernet header)
     * @returns Parsed packet with protocol layers and field offsets
     */
    parse(data: Buffer): ParsedPacket {
        if (!Buffer.isBuffer(data)) {
            throw new Error('Data must be a Buffer')
        }

        if (data.length === 0) {
            throw new Error('Data cannot be empty')
        }

        try {
            return this.nativeInstance.parse(data)
        } catch (error) {
            throw new Error(
                `Failed to parse packet: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }
}

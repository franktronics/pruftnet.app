export interface ParsedPacket {}

export interface RawPacketData {
    data: Buffer
    length: number
    timestamp: Date
    valid: boolean
}

export interface PacketData {
    raw: RawPacketData
    parsed: ParsedPacket
}

export type PacketCallback = (packet: PacketData) => void

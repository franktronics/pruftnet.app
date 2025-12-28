export interface ParsedProtocolLayer {
    [fieldKey: string]: number | bigint
}

export type ParsedPacket = ParsedProtocolLayer[]

export interface RawPacketData {
    data: Uint8Array
    length: number
    timestamp: number
    valid: boolean
}

export interface PacketData {
    raw: RawPacketData
    parsed: ParsedPacket
}

export type PacketCallback = (packet: PacketData) => void

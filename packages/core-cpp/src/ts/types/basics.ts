export interface ParsedProtocolLayer {
    file: string
    [fieldKey: string]: string | number | bigint
}

export type ParsedPacket = ParsedProtocolLayer[]

export interface RawPacketData<BaseType = Uint8Array> {
    data: BaseType
    length: number
    timestamp: number
    valid: boolean
}

export interface PacketData {
    raw: RawPacketData
    parsed: ParsedPacket
}

export type PacketCallback = (packet: PacketData) => void

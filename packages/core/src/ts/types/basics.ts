// Type definitions for the core network analysis package

export enum ProtocolType {
    ETHERNET = 0x0000,
    IPV4 = 0x0800,
    IPV6 = 0x86dd,
    ARP = 0x0806,
    TCP = 0x06,
    UDP = 0x11,
    ICMP = 0x01,
    ICMPV6 = 0x3a,
    UNKNOWN = 0xffff,
}

export interface FieldInfo {
    bitStart: number
    bitLength: number
    name: string
    description: string
    value: number[]
    valueAsString: string
}

export interface ProtocolInfo {
    name: string
    type: ProtocolType
    headerSizeBits: number
    fields: FieldInfo[]
}

export interface ParsedPacket {
    protocols: ProtocolInfo[]
}

export interface RawPacketData {
    data: Buffer
    length: number
    originalLength: number
    timestamp: Date
    valid: boolean
}

export type PacketCallback = (packet: RawPacketData) => void

export interface NetworkInterfaceConfig {
    name: string
}

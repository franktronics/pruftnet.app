// Type definitions for the core network analysis package

/**
 * Protocol identifiers matching C++ ProtocolId enum
 * These are compact uint8 values, not EtherType/IP protocol numbers
 */
export enum ProtocolId {
    ETHERNET = 0,
    ARP = 1,
    IPV4 = 2,
    IPV6 = 3,
    TCP = 4,
    UDP = 5,
    ICMP = 6,
    ICMPV6 = 7,
    UNKNOWN = 255,
}

/**
 * Field entry in the binary-compact parsed packet format
 * Points to field data in the raw packet buffer - O(1) access
 */
export interface FieldEntry {
    /** Byte offset into raw packet data */
    byteOffset: number
    /** Length of field in bytes */
    byteLength: number
    /** Field ID within the protocol (protocol-specific) */
    fieldId: number
}

/**
 * Protocol entry in the binary-compact parsed packet format
 */
export interface ProtocolEntry {
    /** Protocol identifier */
    protocolId: ProtocolId
    /** Byte offset of protocol header in raw packet */
    headerOffset: number
    /** Number of fields parsed for this protocol */
    fieldCount: number
    /** Array of field entries (max 16 per protocol) */
    fields: FieldEntry[]
}

/**
 * Binary-compact parsed packet
 * Does not copy field values - stores offsets into raw data for O(1) access
 */
export interface ParsedPacket {
    /** Number of protocols parsed (layers in the packet) */
    protocolCount: number
    /** Array of protocol entries (max 8 per packet) */
    protocols: ProtocolEntry[]
    /** Whether the packet was successfully parsed */
    valid: boolean
}

/**
 * Raw packet data from the sniffer
 */
export interface RawPacketData {
    /** Raw packet bytes */
    data: Buffer
    /** Captured length */
    length: number
    /** Original length (may be larger if truncated) */
    originalLength: number
    /** Capture timestamp */
    timestamp: Date
    /** Whether the packet data is valid */
    valid: boolean
}

/**
 * Combined packet with both raw data and parsed metadata
 * Frontend can use parsed.protocols[i].fields[j].byteOffset
 * to read field values directly from raw.data
 */
export interface PacketData {
    raw: RawPacketData
    parsed: ParsedPacket
}

/**
 * Callback for receiving parsed packets from the sniffer
 */
export type PacketCallback = (packet: PacketData) => void

// Field ID constants for each protocol
// These match the order in C++ protocol_definitions.hpp

export const ETHERNET_FIELDS = {
    DST_MAC: 0,
    SRC_MAC: 1,
    ETHERTYPE: 2,
} as const

export const ARP_FIELDS = {
    HARDWARE_TYPE: 0,
    PROTOCOL_TYPE: 1,
    HARDWARE_SIZE: 2,
    PROTOCOL_SIZE: 3,
    OPCODE: 4,
    SENDER_MAC: 5,
    SENDER_IP: 6,
    TARGET_MAC: 7,
    TARGET_IP: 8,
} as const

export const IPV4_FIELDS = {
    VERSION: 0,
    IHL: 1,
    DSCP: 2,
    ECN: 3,
    TOTAL_LENGTH: 4,
    IDENTIFICATION: 5,
    FLAGS: 6,
    FRAGMENT_OFFSET: 7,
    TTL: 8,
    PROTOCOL: 9,
    HEADER_CHECKSUM: 10,
    SRC_IP: 11,
    DST_IP: 12,
} as const

export const IPV6_FIELDS = {
    VERSION: 0,
    TRAFFIC_CLASS: 1,
    FLOW_LABEL: 2,
    PAYLOAD_LENGTH: 3,
    NEXT_HEADER: 4,
    HOP_LIMIT: 5,
    SRC_IP: 6,
    DST_IP: 7,
} as const

export const TCP_FIELDS = {
    SRC_PORT: 0,
    DST_PORT: 1,
    SEQ_NUMBER: 2,
    ACK_NUMBER: 3,
    DATA_OFFSET: 4,
    RESERVED: 5,
    FLAGS: 6,
    WINDOW_SIZE: 7,
    CHECKSUM: 8,
    URGENT_POINTER: 9,
} as const

export const UDP_FIELDS = {
    SRC_PORT: 0,
    DST_PORT: 1,
    LENGTH: 2,
    CHECKSUM: 3,
} as const

/**
 * Helper to read a field value from raw packet data
 * @param raw Raw packet buffer
 * @param field Field entry from parsed packet
 * @returns Field value as a Buffer slice
 */
export function readField(raw: Buffer, field: FieldEntry): Buffer {
    return raw.subarray(field.byteOffset, field.byteOffset + field.byteLength)
}

/**
 * Helper to read a field as a big-endian unsigned integer
 * @param raw Raw packet buffer
 * @param field Field entry from parsed packet
 * @returns Field value as number (for fields <= 6 bytes)
 */
export function readFieldAsUint(raw: Buffer, field: FieldEntry): number {
    const slice = raw.subarray(field.byteOffset, field.byteOffset + field.byteLength)
    if (field.byteLength <= 6) {
        return slice.readUIntBE(0, field.byteLength)
    }
    throw new Error(`Field too large for number: ${field.byteLength} bytes`)
}

/**
 * Helper to format MAC address from 6 bytes
 */
export function formatMac(raw: Buffer, field: FieldEntry): string {
    const bytes = raw.subarray(field.byteOffset, field.byteOffset + 6)
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(':')
}

/**
 * Helper to format IPv4 address from 4 bytes
 */
export function formatIPv4(raw: Buffer, field: FieldEntry): string {
    const bytes = raw.subarray(field.byteOffset, field.byteOffset + 4)
    return Array.from(bytes).join('.')
}

/**
 * Helper to format IPv6 address from 16 bytes
 */
export function formatIPv6(raw: Buffer, field: FieldEntry): string {
    const bytes = raw.subarray(field.byteOffset, field.byteOffset + 16)
    const parts: string[] = []
    for (let i = 0; i < 16; i += 2) {
        parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16))
    }
    return parts.join(':')
}

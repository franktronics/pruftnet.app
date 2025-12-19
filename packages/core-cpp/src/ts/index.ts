// Main entry point for @repo/core package
export { PacketParser } from './parser/packet-parser.js'
export { NetworkSniffer, isSnifferAvailable } from './sniffer/network-sniffer.js'

// Export types
export type {
    ParsedPacket,
    ProtocolEntry,
    FieldEntry,
    RawPacketData,
    PacketData,
    PacketCallback,
    NetworkInterfaceConfig,
} from './types/basics.js'

// Export enums and constants
export {
    ProtocolId,
    ETHERNET_FIELDS,
    ARP_FIELDS,
    IPV4_FIELDS,
    IPV6_FIELDS,
    TCP_FIELDS,
    UDP_FIELDS,
    readField,
    readFieldAsUint,
    formatMac,
    formatIPv4,
    formatIPv6,
} from './types/basics.js'

// Version info
export const VERSION = '0.0.1'

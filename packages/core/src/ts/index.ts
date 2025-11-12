// Main entry point for @repo/core package
export { PacketParser } from './parser/packet-parser'
export { NetworkSniffer } from './sniffer/network-sniffer'
export { NetworkInterface } from './network-interface/network-interface'

// Export types
export type {
    ParsedPacket,
    ProtocolInfo,
    FieldInfo,
    ProtocolType,
    RawPacketData,
    PacketCallback,
    NetworkInterfaceConfig,
} from './types/basics'

// Version info
export const VERSION = '0.0.1'

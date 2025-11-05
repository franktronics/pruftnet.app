// Main entry point for @repo/core package
export { PacketParser } from './parser/packet-parser'

// Export types
export type { 
    ParsedPacket, 
    ProtocolInfo, 
    FieldInfo, 
    ProtocolType 
} from './types/basics'

// Version info
export const VERSION = '0.0.1'

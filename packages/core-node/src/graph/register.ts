import { NodeRegistry } from './registry'
import { ipRangeNode } from './nodes/ip-range'
import { arpScanNode } from './nodes/arp-scan'
import { networkOutputNode } from './nodes/network-output'

export const registerDefaultNodes = (registry: NodeRegistry) => {
    registry.register(ipRangeNode)
    registry.register(arpScanNode)
    registry.register(networkOutputNode)
}

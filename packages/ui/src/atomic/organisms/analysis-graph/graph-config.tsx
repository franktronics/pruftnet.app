import { AnalysisGraphEdge } from './components/graph-edge'
import { NodeIpRange, NodeArpScan, NodeNetworkSource, NodeNetworkOutput } from './nodes'

export const edgeTypes = {
    connect: AnalysisGraphEdge,
}
export const nodeTypes = {
    'net-source': NodeNetworkSource,
    'net-output': NodeNetworkOutput,
    'ip-range': NodeIpRange,
    'arp-scan': NodeArpScan,
}

import { AnalysisGraphEdge } from './components/graph-edge'
import {
    NodeIpRange,
    NodeIpSingle,
    NodeArpScan,
    NodeNetworkSource,
    NodeNetworkOutput,
    NodeIcmpPing,
} from './nodes'

export const edgeTypes = {
    connect: AnalysisGraphEdge,
}
export const nodeTypes = {
    'net-source': NodeNetworkSource,
    'net-output': NodeNetworkOutput,
    'ip-range': NodeIpRange,
    'ip-single': NodeIpSingle,
    'arp-scan': NodeArpScan,
    'icmp-ping': NodeIcmpPing,
}

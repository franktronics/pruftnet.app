import { AnalysisGraphEdge } from './components/graph-edge'
import {
    NodeIpRange,
    NodeIpSingle,
    NodeArpScan,
    NodeNetworkSource,
    NodeNetworkOutput,
    NodeIcmpPing,
    NodeIpv6Single,
    NodeIpv6Ns,
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
    'ipv6-single': NodeIpv6Single,
    'ipv6-ns': NodeIpv6Ns,
}

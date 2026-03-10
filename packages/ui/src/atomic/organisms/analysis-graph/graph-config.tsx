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
    NodeIpv6Rs,
    NodeIcmpv6Ping,
    NodeWaitFor,
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
    'ipv6-rs': NodeIpv6Rs,
    'icmpv6-ping': NodeIcmpv6Ping,
    'wait-for': NodeWaitFor,
}

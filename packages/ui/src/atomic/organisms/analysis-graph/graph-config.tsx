import { AnalysisGraphEdge } from './components/graph-edge'
import { NetworkSource } from './nodes/network-source'
import { NetworkOutput } from './nodes/network-output'
import { IpRange, ArpScan } from './nodes'

export const edgeTypes = {
    connect: AnalysisGraphEdge,
}
export const nodeTypes = {
    'net-source': NetworkSource,
    'net-output': NetworkOutput,
    'ip-range': IpRange,
    'arp-scan': ArpScan,
}

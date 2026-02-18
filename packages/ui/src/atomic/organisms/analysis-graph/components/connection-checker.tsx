import { Connection, Edge } from '@xyflow/react'

export const NODE_TYPES = {
    NetSource: 'net-source',
    NetOutput: 'net-output',
    IpRange: 'ip-range',
    IpSingle: 'ip-single',
    ArpScan: 'arp-scan',
    IcmpPing: 'icmp-ping',
    Icmpv6Ping: 'icmpv6-ping',
    Ipv6Single: 'ipv6-single',
    Ipv6Ns: 'ipv6-ns', //ipv6 neighbor solicitation
    Ipv6Rs: 'ipv6-rs', //ipv6 router solicitation
    WaitFor: 'wait-for',
}

const connectionMap = new Map<string, string[]>([
    [NODE_TYPES.IpRange, [NODE_TYPES.ArpScan, NODE_TYPES.IcmpPing, NODE_TYPES.WaitFor]],
    [NODE_TYPES.IpSingle, [NODE_TYPES.ArpScan, NODE_TYPES.IcmpPing, NODE_TYPES.WaitFor]],
    [NODE_TYPES.ArpScan, [NODE_TYPES.NetOutput, NODE_TYPES.WaitFor]],
    [NODE_TYPES.IcmpPing, [NODE_TYPES.NetOutput, NODE_TYPES.WaitFor]],
    [NODE_TYPES.Icmpv6Ping, [NODE_TYPES.NetOutput, NODE_TYPES.WaitFor]],
    [
        NODE_TYPES.Ipv6Single,
        [NODE_TYPES.Ipv6Ns, NODE_TYPES.Ipv6Rs, NODE_TYPES.Icmpv6Ping, NODE_TYPES.WaitFor],
    ],
    [NODE_TYPES.Ipv6Ns, [NODE_TYPES.NetOutput, NODE_TYPES.WaitFor]],
    [NODE_TYPES.Ipv6Rs, [NODE_TYPES.NetOutput, NODE_TYPES.WaitFor]],
    [
        NODE_TYPES.WaitFor,
        [
            NODE_TYPES.NetOutput,
            NODE_TYPES.ArpScan,
            NODE_TYPES.IcmpPing,
            NODE_TYPES.Icmpv6Ping,
            NODE_TYPES.Ipv6Ns,
            NODE_TYPES.WaitFor,
        ],
    ],
])

const checkBasedOnTypes = (sourceType: string | null, targetType: string | null): boolean => {
    if (!sourceType || !targetType) return false
    const validTargets = connectionMap.get(sourceType)
    return validTargets ? validTargets.includes(targetType) : false
}

export const checkConnection = (connection: Connection | Edge): boolean => {
    const { source, target, sourceHandle, targetHandle } = connection
    const [_, sourceType] = sourceHandle ? sourceHandle.split('/') : [null, null]
    const [__, targetType] = targetHandle ? targetHandle.split('/') : [null, null]

    const checkTypes = checkBasedOnTypes(sourceType, targetType)
    return checkTypes
}

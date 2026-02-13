import { Connection, Edge } from '@xyflow/react'

export const NODE_TYPES = {
    NetSource: 'net-source',
    NetOutput: 'net-output',
    IpRange: 'ip-range',
    ArpScan: 'arp-scan',
    IpSingle: 'ip-single',
    IcmpPing: 'icmp-ping',
}

const connectionMap = new Map<string, string[]>([
    [NODE_TYPES.IpRange, [NODE_TYPES.ArpScan, NODE_TYPES.IcmpPing]],
    [NODE_TYPES.IpSingle, [NODE_TYPES.ArpScan, NODE_TYPES.IcmpPing]],
    [NODE_TYPES.ArpScan, [NODE_TYPES.NetOutput]],
    [NODE_TYPES.IcmpPing, [NODE_TYPES.NetOutput]],
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

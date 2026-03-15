import { PacketData } from '@repo/core-cpp'
import { MapStoreType } from '../trpc/trpc-types'

export type HostBaseData = {
    type: 'host' | 'router' | 'me'
    mac: string
    vendor: string
    ipv4?: string
    ipv6?: string

    // Record<connected Host MAC, connection data>
    connectedTo: Record<
        string,
        {
            numPacketsSend: number
            numPacketsReceived: number
        }
    >
}

export type CheckFunction = (
    packet: PacketData,
    analysedHostsStore: MapStoreType<string, HostBaseData>,
    options: { interface: string },
) => Promise<{ action: 'stop' | 'continue'; updatedHost?: HostBaseData[] }>
export interface AnalyserCheck {
    check: CheckFunction
}

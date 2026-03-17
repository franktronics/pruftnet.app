import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../trpc/trpc-types'

export type HostBaseData = {
    type: 'host' | 'router' | 'me'
    mac: string
    vendor: string | null
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

export type HostAnalyserOptions = {
    interface: string
}

export type AnalysisContext = {
    rawData: Uint8Array
    sourceMac?: string
    destinationMac?: string
    sourceHost?: HostBaseData
    destinationHost?: HostBaseData
    etherType?: number
}

export type CheckAction = 'stop' | 'continue'

export type CheckResult = {
    action: CheckAction
    updatedHosts?: HostBaseData[]
}

export type HostAnalyserRuntime = {
    getCurrentMachineMac: () => string | null
    setCurrentMachineMac: (mac: string) => void
}

export abstract class AnalyserCheck {
    public abstract check(
        packet: PacketData,
        analysedHostsStore: MapStoreType<string, HostBaseData>,
        options: HostAnalyserOptions,
        context: AnalysisContext,
        runtime: HostAnalyserRuntime,
    ): Promise<CheckResult>
}

import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../../trpc/trpc-types'
import { TypeConverter } from '../../converter/type-converter'
import { AnalyserCheck } from '../types'
import type {
    AnalysisContext,
    CheckResult,
    HostAnalyserOptions,
    HostAnalyserRuntime,
    HostBaseData,
} from '../types'

const ETHERNET_HEADER_LENGTH = 14
const IPV4_ETHER_TYPE = 0x0800
const IPV6_ETHER_TYPE = 0x86dd
const IPV4_HEADER_MIN_LENGTH = 20
const IPV6_HEADER_LENGTH = 40

export class IpCheck extends AnalyserCheck {
    public async check(
        _packet: PacketData,
        _analysedHostsStore: MapStoreType<string, HostBaseData>,
        _options: HostAnalyserOptions,
        context: AnalysisContext,
        _runtime: HostAnalyserRuntime,
    ): Promise<CheckResult> {
        if (!context.sourceHost || !context.destinationHost) {
            return { action: 'stop' }
        }

        context.etherType = this.extractEtherType(context.rawData)

        if (context.etherType === IPV4_ETHER_TYPE) {
            this.updateIpv4Data(context.rawData, context.sourceHost, context.destinationHost)
        }

        if (context.etherType === IPV6_ETHER_TYPE) {
            this.updateIpv6Data(context.rawData, context.sourceHost, context.destinationHost)
        }

        return {
            action: 'continue',
            updatedHosts: [context.sourceHost, context.destinationHost],
        }
    }

    private extractEtherType(rawData: Uint8Array): number {
        return (rawData[12]! << 8) | rawData[13]!
    }

    private updateIpv4Data(
        rawData: Uint8Array,
        sourceHost: HostBaseData,
        destinationHost: HostBaseData,
    ): void {
        if (rawData.length < ETHERNET_HEADER_LENGTH + IPV4_HEADER_MIN_LENGTH) {
            return
        }

        const ipHeaderOffset = ETHERNET_HEADER_LENGTH
        const version = rawData[ipHeaderOffset]! >> 4

        if (version !== 4) {
            return
        }

        sourceHost.ipv4 = TypeConverter.bytesToIpv4String(rawData.slice(26, 30))
        destinationHost.ipv4 = TypeConverter.bytesToIpv4String(rawData.slice(30, 34))
    }

    private updateIpv6Data(
        rawData: Uint8Array,
        sourceHost: HostBaseData,
        destinationHost: HostBaseData,
    ): void {
        if (rawData.length < ETHERNET_HEADER_LENGTH + IPV6_HEADER_LENGTH) {
            return
        }

        const ipHeaderOffset = ETHERNET_HEADER_LENGTH
        const version = rawData[ipHeaderOffset]! >> 4

        if (version !== 6) {
            return
        }

        sourceHost.ipv6 = TypeConverter.bytesToIpv6String(rawData.slice(22, 38))
        destinationHost.ipv6 = TypeConverter.bytesToIpv6String(rawData.slice(38, 54))
    }
}

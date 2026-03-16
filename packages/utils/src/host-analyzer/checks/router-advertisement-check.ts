import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../../trpc/trpc-types'
import { AnalyserCheck } from '../types'
import type {
    AnalysisContext,
    CheckResult,
    HostAnalyserOptions,
    HostAnalyserRuntime,
    HostBaseData,
} from '../types'

const ETHERNET_HEADER_LENGTH = 14
const IPV6_ETHER_TYPE = 0x86dd
const IPV6_HEADER_LENGTH = 40
const ICMPV6_NEXT_HEADER = 58
const ICMPV6_ROUTER_ADVERTISEMENT_TYPE = 134

export class RouterAdvertisementCheck extends AnalyserCheck {
    public async check(
        _packet: PacketData,
        _analysedHostsStore: MapStoreType<string, HostBaseData>,
        _options: HostAnalyserOptions,
        context: AnalysisContext,
        _runtime: HostAnalyserRuntime,
    ): Promise<CheckResult> {
        if (
            context.etherType !== IPV6_ETHER_TYPE ||
            !context.sourceHost ||
            context.rawData.length <= ETHERNET_HEADER_LENGTH + IPV6_HEADER_LENGTH
        ) {
            return { action: 'continue' }
        }

        const nextHeaderOffset = ETHERNET_HEADER_LENGTH + 6
        const icmpv6HeaderOffset = ETHERNET_HEADER_LENGTH + IPV6_HEADER_LENGTH
        const nextHeader = context.rawData[nextHeaderOffset]

        if (nextHeader !== ICMPV6_NEXT_HEADER) {
            return { action: 'continue' }
        }

        const icmpv6Type = context.rawData[icmpv6HeaderOffset]

        if (icmpv6Type !== ICMPV6_ROUTER_ADVERTISEMENT_TYPE) {
            return { action: 'continue' }
        }

        context.sourceHost.type = 'router'

        return {
            action: 'continue',
            updatedHosts: [context.sourceHost],
        }
    }
}

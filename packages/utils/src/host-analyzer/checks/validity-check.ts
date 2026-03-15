import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../../trpc/trpc-types'
import { AnalyserCheck } from '../types'
import type { AnalysisContext, CheckResult, HostAnalyserOptions, HostBaseData } from '../types'

const ETHERNET_HEADER_LENGTH = 14

export class ValidityCheck extends AnalyserCheck {
    public async check(
        packet: PacketData,
        _analysedHostsStore: MapStoreType<string, HostBaseData>,
        _options: HostAnalyserOptions,
        context: AnalysisContext,
    ): Promise<CheckResult> {
        if (!packet.raw.valid || packet.raw.data.length < ETHERNET_HEADER_LENGTH) {
            return { action: 'stop' }
        }

        context.rawData = packet.raw.data

        return { action: 'continue' }
    }
}

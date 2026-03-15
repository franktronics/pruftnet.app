import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../trpc/trpc-types'
import { IpCheck } from './checks/ip-check'
import { MacCheck } from './checks/mac-check'
import { RouterAdvertisementCheck } from './checks/router-advertisement-check'
import { ValidityCheck } from './checks/validity-check'
import type { AnalysisContext, AnalyserCheck, HostAnalyserOptions, HostBaseData } from './types'

export class HostAnalyser {
    private checksTable: AnalyserCheck[] = [
        new ValidityCheck(),
        new MacCheck(),
        new IpCheck(),
        new RouterAdvertisementCheck(),
    ]

    constructor(
        private analysedHostsStore: MapStoreType<string, HostBaseData>,
        private options: HostAnalyserOptions,
    ) {}

    public async addPacket(packet: PacketData): Promise<Map<string, HostBaseData>> {
        const updatedHosts = new Map<string, HostBaseData>()
        const context: AnalysisContext = {
            rawData: packet.raw.data,
        }

        for (const check of this.checksTable) {
            const { action, updatedHosts: checkUpdatedHosts } = await check.check(
                packet,
                this.analysedHostsStore,
                this.options,
                context,
            )

            if (checkUpdatedHosts) {
                for (const host of checkUpdatedHosts) {
                    this.analysedHostsStore.set(host.mac, host)
                    updatedHosts.set(host.mac, host)
                }
            }

            if (action === 'stop') {
                break
            }
        }

        return updatedHosts
    }
}

import os from 'node:os'
import type { PacketData } from '@repo/core-cpp'
import type { MapStoreType } from '../../trpc/trpc-types'
import { TypeConverter } from '../../converter/type-converter'
import { getVendorFromMac } from '../../vendor-oui'
import { AnalyserCheck } from '../types'
import type {
    AnalysisContext,
    CheckResult,
    HostAnalyserOptions,
    HostAnalyserRuntime,
    HostBaseData,
} from '../types'

export class MacCheck extends AnalyserCheck {
    public async check(
        _packet: PacketData,
        analysedHostsStore: MapStoreType<string, HostBaseData>,
        options: HostAnalyserOptions,
        context: AnalysisContext,
        runtime: HostAnalyserRuntime,
    ): Promise<CheckResult> {
        const { rawData } = context
        const destinationMac = TypeConverter.bytesToMacString(rawData.slice(0, 6))
        const sourceMac = TypeConverter.bytesToMacString(rawData.slice(6, 12))
        const sourceHost = this.upsertHost(analysedHostsStore, sourceMac)
        const destinationHost = this.upsertHost(analysedHostsStore, destinationMac)
        const currentMachineMac =
            runtime.getCurrentMachineMac() ?? this.resolveCurrentMachineMac(options.interface)

        if (currentMachineMac) {
            if (!runtime.getCurrentMachineMac()) {
                runtime.setCurrentMachineMac(currentMachineMac)
            }

            this.markHostAsCurrentMachine(sourceHost, sourceMac, currentMachineMac)
            this.markHostAsCurrentMachine(destinationHost, destinationMac, currentMachineMac)
        }

        context.sourceMac = sourceMac
        context.destinationMac = destinationMac
        context.sourceHost = sourceHost
        context.destinationHost = destinationHost

        this.incrementSentPackets(sourceHost, destinationMac)
        this.incrementReceivedPackets(destinationHost, sourceMac)

        return {
            action: 'continue',
            updatedHosts: [sourceHost, destinationHost],
        }
    }

    private upsertHost(
        analysedHostsStore: MapStoreType<string, HostBaseData>,
        mac: string,
    ): HostBaseData {
        const existingHost = analysedHostsStore.get(mac)

        if (existingHost) {
            return existingHost
        }

        return {
            type: 'host',
            mac,
            vendor: getVendorFromMac(mac),
            connectedTo: {},
        }
    }

    private resolveCurrentMachineMac(interfaceName: string): string | null {
        const interfaceAddresses = os.networkInterfaces()[interfaceName]

        if (!interfaceAddresses) {
            return null
        }

        for (const interfaceAddress of interfaceAddresses) {
            if (
                !interfaceAddress ||
                !interfaceAddress.mac ||
                interfaceAddress.mac === '00:00:00:00:00:00'
            ) {
                continue
            }

            return interfaceAddress.mac.toUpperCase()
        }

        return null
    }

    private markHostAsCurrentMachine(
        host: HostBaseData,
        hostMac: string,
        currentMachineMac: string,
    ): void {
        if (hostMac === currentMachineMac) {
            host.type = 'me'
        }
    }

    private incrementSentPackets(host: HostBaseData, targetMac: string): void {
        const currentLink = host.connectedTo[targetMac] ?? {
            numPacketsSend: 0,
            numPacketsReceived: 0,
        }

        host.connectedTo[targetMac] = {
            ...currentLink,
            numPacketsSend: currentLink.numPacketsSend + 1,
        }
    }

    private incrementReceivedPackets(host: HostBaseData, sourceMac: string): void {
        const currentLink = host.connectedTo[sourceMac] ?? {
            numPacketsSend: 0,
            numPacketsReceived: 0,
        }

        host.connectedTo[sourceMac] = {
            ...currentLink,
            numPacketsReceived: currentLink.numPacketsReceived + 1,
        }
    }
}

import type { PacketData } from '@repo/core-cpp'
import type { StoreType } from '../../../core-node/src/routes/root'
import type { HostBaseData } from './types'
import { TypeConverter } from '../converter/type-converter'
import { getVendorFromMac } from '../vendor-oui'

export class HostAnalyser {
    constructor(private analysedHostsStore: StoreType['analysedHosts']) {}

    public async addPacket(packet: PacketData): Promise<HostBaseData[]> {
        if (!packet.raw.valid || packet.raw.data.length < 14) {
            return []
        }

        const { sourceMac, destinationMac } = this.extractEthernetMacs(packet.raw.data)
        const updatedHosts = new Map<string, HostBaseData>()

        const sourceHost = this.upsertHost(sourceMac)
        updatedHosts.set(sourceMac, sourceHost)

        const destinationHost = this.upsertHost(destinationMac)
        updatedHosts.set(destinationMac, destinationHost)

        this.incrementSentPackets(sourceHost, destinationMac)
        this.incrementReceivedPackets(destinationHost, sourceMac)

        this.analysedHostsStore.set(sourceMac, sourceHost)
        this.analysedHostsStore.set(destinationMac, destinationHost)

        return Array.from(updatedHosts.values())
    }

    private extractEthernetMacs(rawData: Uint8Array) {
        return {
            destinationMac: TypeConverter.bytesToMacString(rawData.slice(0, 6)),
            sourceMac: TypeConverter.bytesToMacString(rawData.slice(6, 12)),
        }
    }

    private upsertHost(mac: string): HostBaseData {
        const existingHost = this.analysedHostsStore.get(mac)

        if (existingHost) {
            return existingHost
        }

        return {
            type: 'host',
            mac,
            vendor: getVendorFromMac(mac) || 'Unknown Vendor',
            connectedTo: {},
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

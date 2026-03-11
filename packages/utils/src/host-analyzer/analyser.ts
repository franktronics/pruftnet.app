import type { PacketData } from '@repo/core-cpp'
import type { StoreType } from '../../../core-node/src/routes/root'
import type { HostBaseData } from './types'
import { TypeConverter } from '../converter/type-converter'
import { getVendorFromMac } from '../vendor-oui'

const ETHERNET_HEADER_LENGTH = 14
const IPV4_ETHER_TYPE = 0x0800
const IPV6_ETHER_TYPE = 0x86dd
const IPV4_HEADER_MIN_LENGTH = 20
const IPV6_HEADER_LENGTH = 40
const ICMPV6_NEXT_HEADER = 58
const ICMPV6_ROUTER_ADVERTISEMENT_TYPE = 134

export class HostAnalyser {
    constructor(private analysedHostsStore: StoreType['analysedHosts']) {}

    public async addPacket(packet: PacketData): Promise<HostBaseData[]> {
        if (!packet.raw.valid || packet.raw.data.length < ETHERNET_HEADER_LENGTH) {
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
        this.updateHostIpData(packet.raw.data, sourceHost, destinationHost)

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

    private extractEtherType(rawData: Uint8Array): number {
        return (rawData[12]! << 8) | rawData[13]!
    }

    private updateHostIpData(
        rawData: Uint8Array,
        sourceHost: HostBaseData,
        destinationHost: HostBaseData,
    ): void {
        const etherType = this.extractEtherType(rawData)

        if (etherType === IPV4_ETHER_TYPE) {
            this.updateIpv4Data(rawData, sourceHost, destinationHost)
            return
        }

        if (etherType === IPV6_ETHER_TYPE) {
            this.updateIpv6Data(rawData, sourceHost, destinationHost)
        }
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

        this.updateRouterTypeFromIpv6Icmp(rawData, sourceHost)
    }

    private updateRouterTypeFromIpv6Icmp(rawData: Uint8Array, sourceHost: HostBaseData): void {
        const nextHeaderOffset = ETHERNET_HEADER_LENGTH + 6
        const icmpv6HeaderOffset = ETHERNET_HEADER_LENGTH + IPV6_HEADER_LENGTH

        if (rawData.length <= icmpv6HeaderOffset) {
            return
        }

        const nextHeader = rawData[nextHeaderOffset]

        if (nextHeader !== ICMPV6_NEXT_HEADER) {
            return
        }

        const icmpv6Type = rawData[icmpv6HeaderOffset]

        if (icmpv6Type === ICMPV6_ROUTER_ADVERTISEMENT_TYPE) {
            sourceHost.type = 'router'
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

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
const ARP_ETHER_TYPE = 0x0806
const IPV4_ETHER_TYPE = 0x0800
const ARP_HEADER_LENGTH = 28
const ARP_ETHERNET_HARDWARE_TYPE = 1
const ARP_ETHERNET_HARDWARE_SIZE = 6
const ARP_IPV4_PROTOCOL_SIZE = 4
const ARP_REPLY_OPERATION = 2
const ARP_HARDWARE_TYPE_OFFSET = ETHERNET_HEADER_LENGTH
const ARP_PROTOCOL_TYPE_OFFSET = ETHERNET_HEADER_LENGTH + 2
const ARP_HARDWARE_SIZE_OFFSET = ETHERNET_HEADER_LENGTH + 4
const ARP_PROTOCOL_SIZE_OFFSET = ETHERNET_HEADER_LENGTH + 5
const ARP_OPERATION_OFFSET = ETHERNET_HEADER_LENGTH + 6
const ARP_SENDER_PROTOCOL_ADDRESS_OFFSET = ETHERNET_HEADER_LENGTH + 14
const ARP_TARGET_PROTOCOL_ADDRESS_OFFSET = ETHERNET_HEADER_LENGTH + 24

export class ArpCheck extends AnalyserCheck {
    public async check(
        _packet: PacketData,
        _analysedHostsStore: MapStoreType<string, HostBaseData>,
        _options: HostAnalyserOptions,
        context: AnalysisContext,
        _runtime: HostAnalyserRuntime,
    ): Promise<CheckResult> {
        if (
            context.etherType !== ARP_ETHER_TYPE ||
            !context.sourceHost ||
            !context.destinationHost ||
            context.rawData.length < ETHERNET_HEADER_LENGTH + ARP_HEADER_LENGTH
        ) {
            return { action: 'continue' }
        }

        if (!this.isSupportedArpPacket(context.rawData)) {
            return { action: 'stop' }
        }

        if (!this.isArpReply(context.rawData)) {
            return { action: 'stop' }
        }

        context.sourceHost.ipv4 = TypeConverter.bytesToIpv4String(
            context.rawData.slice(
                ARP_SENDER_PROTOCOL_ADDRESS_OFFSET,
                ARP_SENDER_PROTOCOL_ADDRESS_OFFSET + 4,
            ),
        )
        context.destinationHost.ipv4 = TypeConverter.bytesToIpv4String(
            context.rawData.slice(
                ARP_TARGET_PROTOCOL_ADDRESS_OFFSET,
                ARP_TARGET_PROTOCOL_ADDRESS_OFFSET + 4,
            ),
        )

        return {
            action: 'stop',
            updatedHosts: [context.sourceHost, context.destinationHost],
        }
    }

    private isSupportedArpPacket(rawData: Uint8Array): boolean {
        const hardwareType = this.readUint16(rawData, ARP_HARDWARE_TYPE_OFFSET)
        const protocolType = this.readUint16(rawData, ARP_PROTOCOL_TYPE_OFFSET)
        const hardwareSize = rawData[ARP_HARDWARE_SIZE_OFFSET]
        const protocolSize = rawData[ARP_PROTOCOL_SIZE_OFFSET]

        return (
            hardwareType === ARP_ETHERNET_HARDWARE_TYPE &&
            protocolType === IPV4_ETHER_TYPE &&
            hardwareSize === ARP_ETHERNET_HARDWARE_SIZE &&
            protocolSize === ARP_IPV4_PROTOCOL_SIZE
        )
    }

    private isArpReply(rawData: Uint8Array): boolean {
        return this.readUint16(rawData, ARP_OPERATION_OFFSET) === ARP_REPLY_OPERATION
    }

    private readUint16(rawData: Uint8Array, offset: number): number {
        return (rawData[offset]! << 8) | rawData[offset + 1]!
    }
}

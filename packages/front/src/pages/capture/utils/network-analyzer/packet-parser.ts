import type { PacketDataWithoutRaw } from '@repo/core-node/types'
import { ConnectionManager } from './connection-manager'
import { DeviceManager } from './device-manager'
import { IpAddressExtractor } from './ip-address-extractor'
import { MacAddressExtractor } from './mac-address-extractor'

export type DeviceType = 'computer' | 'unknown' | 'router'
export type DeviceBasisType = {
    id: string
    type: DeviceType
    data: {
        mac: string
        vendor?: string
        ipv4?: string
        ipv6?: string
    }
}
export type ConnectionType = {
    id: string
    source: string
    target: string
    bidirectional: boolean
    data: {
        numPackets: number
    }
}
export class PacketParser {
    private macExtractor: MacAddressExtractor
    private ipExtractor: IpAddressExtractor
    private deviceManager: DeviceManager
    private connectionManager: ConnectionManager

    constructor() {
        this.macExtractor = new MacAddressExtractor()
        this.ipExtractor = new IpAddressExtractor()
        this.deviceManager = new DeviceManager()
        this.connectionManager = new ConnectionManager()
    }

    private isMulticastMac(mac: string): boolean {
        const firstOctet = parseInt(mac.substring(0, 2), 16)
        return (firstOctet & 0x01) === 0x01
    }

    private shouldFilterPacket(sourceMac: string, destMac: string): boolean {
        if (destMac === 'FF:FF:FF:FF:FF:FF') return true

        if (this.isMulticastMac(destMac)) return true

        if (sourceMac === '00:00:00:00:00:00' || destMac === '00:00:00:00:00:00') return true

        if (sourceMac === destMac) return true

        return false
    }

    public parse(
        packet: PacketDataWithoutRaw,
        devicesStore: Map<string, DeviceBasisType>,
        connectionsStore: Map<string, ConnectionType>,
    ): {
        devices: Map<string, DeviceBasisType>
        connections: Map<string, ConnectionType>
    } {
        const sourceMac = this.macExtractor.extractSourceMac(packet)
        const destMac = this.macExtractor.extractDestinationMac(packet)

        if (!sourceMac || !destMac) {
            return {
                devices: new Map(),
                connections: new Map(),
            }
        }

        if (this.shouldFilterPacket(sourceMac, destMac)) {
            return {
                devices: new Map(),
                connections: new Map(),
            }
        }

        const changedDevices = new Map<string, DeviceBasisType>()
        const changedConnections = new Map<string, ConnectionType>()

        const sourceResult = this.deviceManager.ensureDevice(sourceMac, devicesStore)
        if (sourceResult.isNew) {
            changedDevices.set(sourceMac, sourceResult.device)
        }

        const destResult = this.deviceManager.ensureDevice(destMac, devicesStore)
        if (destResult.isNew) {
            changedDevices.set(destMac, destResult.device)
        }

        const ipAddresses = this.ipExtractor.extractIpAddresses(packet)
        if (ipAddresses.sourceIpv4 || ipAddresses.sourceIpv6) {
            const updateResult = this.deviceManager.updateDeviceIp(
                sourceMac,
                ipAddresses.sourceIpv4,
                ipAddresses.sourceIpv6,
                devicesStore,
            )
            if (updateResult.isUpdated && updateResult.device) {
                changedDevices.set(sourceMac, updateResult.device)
            }
        }
        if (ipAddresses.destIpv4 || ipAddresses.destIpv6) {
            const updateResult = this.deviceManager.updateDeviceIp(
                destMac,
                ipAddresses.destIpv4,
                ipAddresses.destIpv6,
                devicesStore,
            )
            if (updateResult.isUpdated && updateResult.device) {
                changedDevices.set(destMac, updateResult.device)
            }
        }

        const connectionResult = this.connectionManager.registerConnection(
            sourceMac,
            destMac,
            connectionsStore,
        )
        if (connectionResult.isNew || connectionResult.isUpdated) {
            changedConnections.set(connectionResult.connection.id, connectionResult.connection)
        }

        return {
            devices: changedDevices,
            connections: changedConnections,
        }
    }
}

import type { PacketDataWithoutRaw } from '@repo/core-node/types'
import { ConnectionManager } from './connection-manager'
import { DeviceManager } from './device-manager'
import { MacAddressExtractor } from './mac-address-extractor'

export type DeviceType = 'computer' | 'unknown' | 'router'
export type DeviceBasisType = {
    id: string
    type: DeviceType
    data: {
        mac: string
        vendor?: string
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
    private deviceManager: DeviceManager
    private connectionManager: ConnectionManager

    constructor() {
        this.macExtractor = new MacAddressExtractor()
        this.deviceManager = new DeviceManager()
        this.connectionManager = new ConnectionManager()
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

        this.deviceManager.ensureDevice(sourceMac, devicesStore)
        this.deviceManager.ensureDevice(destMac, devicesStore)

        this.connectionManager.registerConnection(sourceMac, destMac, connectionsStore)

        return {
            devices: devicesStore,
            connections: connectionsStore,
        }
    }
}

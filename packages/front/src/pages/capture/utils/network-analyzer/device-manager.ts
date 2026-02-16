import type { DeviceBasisType, DeviceType } from './packet-parser'

export class DeviceManager {
    private createDevice(mac: string, type: DeviceType = 'unknown'): DeviceBasisType {
        return {
            id: mac,
            type,
            data: {
                mac,
            },
        }
    }

    public ensureDevice(mac: string, devicesStore: Map<string, DeviceBasisType>): DeviceBasisType {
        const existingDevice = devicesStore.get(mac)
        if (existingDevice) {
            return existingDevice
        }

        const newDevice = this.createDevice(mac)
        devicesStore.set(mac, newDevice)
        return newDevice
    }
}

import type { DeviceBasisType, DeviceType } from './packet-parser'

export type DeviceResult = {
    device: DeviceBasisType
    isNew: boolean
}

export type DeviceUpdateResult = {
    device: DeviceBasisType | null
    isUpdated: boolean
}

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

    public ensureDevice(mac: string, devicesStore: Map<string, DeviceBasisType>): DeviceResult {
        const existingDevice = devicesStore.get(mac)
        if (existingDevice) {
            return {
                device: existingDevice,
                isNew: false,
            }
        }

        const newDevice = this.createDevice(mac)
        devicesStore.set(mac, newDevice)
        return {
            device: newDevice,
            isNew: true,
        }
    }

    public updateDeviceIp(
        mac: string,
        ipv4: string | null,
        ipv6: string | null,
        devicesStore: Map<string, DeviceBasisType>,
    ): DeviceUpdateResult {
        const device = devicesStore.get(mac)
        if (!device) {
            return {
                device: null,
                isUpdated: false,
            }
        }

        const hasIpv4Change = ipv4 && device.data.ipv4 !== ipv4
        const hasIpv6Change = ipv6 && device.data.ipv6 !== ipv6

        if (!hasIpv4Change && !hasIpv6Change) {
            return {
                device,
                isUpdated: false,
            }
        }

        const updatedDevice: DeviceBasisType = {
            ...device,
            data: {
                ...device.data,
                ...(ipv4 && { ipv4 }),
                ...(ipv6 && { ipv6 }),
            },
        }

        devicesStore.set(mac, updatedDevice)
        return {
            device: updatedDevice,
            isUpdated: true,
        }
    }
}

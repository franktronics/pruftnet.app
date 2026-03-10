import { PacketData } from '@repo/core-cpp'
import { StoreType } from '../../routes/root'
import ouiData from 'oui-data' with { type: 'json' }

export class HostAnalyser {
    constructor(private analysedHostsStore: StoreType['analysedHosts']) {}

    public async addPacket(packet: PacketData) {}

    private getVendor(mac: string) {
        const normalized = mac
            .toUpperCase()
            .replace(/[^A-F0-9]/g, '')
            .slice(0, 6)
        return (ouiData as Record<string, string>)[normalized] ?? 'Unknown Vendor'
    }
}

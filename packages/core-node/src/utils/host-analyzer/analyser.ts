import { PacketData } from '@repo/core-cpp'
import { StoreType } from '../../routes/root'

export class HostAnalyser {
    constructor(private analysedHostsStore: StoreType['analysedHosts']) {}

    public async addPacket(packet: PacketData) {}
}

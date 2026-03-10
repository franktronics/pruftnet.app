import { trpcServer, trpcContext, type MapStoreType } from '@repo/utils'
import { NetworkSniffer, type PacketData } from '@repo/core-cpp'
import { ProtocolFile } from '../services/protocol-file-loader-service'
import { AppSettings } from '../models/settings-model'
import PQueue from 'p-queue'
import { HostBaseData } from '../utils'

const { createWsProcedure, createProcedure } = trpcServer
const { MapStore } = trpcContext

export type StoreType = {
    packets: MapStoreType<number, PacketData>
    settings: MapStoreType<'settings', AppSettings>
    protocolFiles: MapStoreType<string, ProtocolFile>
    sniffer: MapStoreType<'sniffer', NetworkSniffer | null>
    snifferQueue: MapStoreType<'queue', PQueue | null>
    analysedHosts: MapStoreType<string, HostBaseData>
}

const packetStore: StoreType['packets'] = new MapStore()
const settingsStore: StoreType['settings'] = new MapStore()
const protocolFileStore: StoreType['protocolFiles'] = new MapStore()
const snifferStore: StoreType['sniffer'] = new MapStore()
const snifferQueueStore: StoreType['snifferQueue'] = new MapStore()
const analysedHostsStore: StoreType['analysedHosts'] = new MapStore()

export const stores: StoreType = {
    packets: packetStore,
    settings: settingsStore,
    protocolFiles: protocolFileStore,

    sniffer: snifferStore,
    snifferQueue: snifferQueueStore,

    analysedHosts: analysedHostsStore,
}
export const procedure = createProcedure(stores)
export const wsProcedure = createWsProcedure(stores)

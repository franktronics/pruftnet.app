import { trpcServer, trpcContext, type MapStoreType } from '@repo/utils'
import { NetworkSniffer, type PacketData } from '@repo/core-cpp'
import { AppSettings } from '../controllers/settings-controller'
import { ProtocolFile } from '../services/protocol-file-loader-service'

const { createWsProcedure, createProcedure } = trpcServer
const { MapStore } = trpcContext

const packetStore: MapStoreType<number, PacketData> = new MapStore()
const scanStore: MapStoreType<number, NetworkSniffer> = new MapStore()
const settingsStore: MapStoreType<'settings', AppSettings> = new MapStore()
const protocolFileStore: MapStoreType<string, ProtocolFile> = new MapStore()

export const stores = {
    packets: packetStore,
    scan: scanStore,
    settings: settingsStore,
    protocolFiles: protocolFileStore,
}
export const procedure = createProcedure(stores)
export const wsProcedure = createWsProcedure(stores)

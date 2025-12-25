import { trpcServer, trpcContext } from '@repo/utils'
import {
    NetworkSniffer,
    type PacketData,
    type RawPacketData,
    type ParsedPacket,
} from '@repo/core-cpp'
import { z } from 'zod'

const { createWsProcedure, createProcedure, ServerError } = trpcServer
const { MapStore } = trpcContext

const packetStore = new MapStore<number, PacketData>()
const scanStore = new MapStore<number, NetworkSniffer>()
const procedure = createProcedure({ packets: packetStore, scan: scanStore })
const wsProcedure = createWsProcedure({ packets: packetStore, scan: scanStore })

export type PacketDataForClient = {
    parsed: ParsedPacket
    raw: Omit<RawPacketData, 'data'>
}

export class ScanController {
    constructor() {}

    private makeSniffing() {
        return wsProcedure
            .input(
                z.object({
                    interface: z.string(),
                }),
            )
            .handle(async ({ input, store }, returnCb: (data: PacketDataForClient) => void) => {
                const sniffer = new NetworkSniffer()
                const scanId = Date.now()
                store.scan.set(scanId, sniffer)

                let counter = 0
                sniffer.startSniffing(input.interface, (packet: PacketData) => {
                    store.packets.set(counter++, packet)
                    returnCb({
                        parsed: packet.parsed,
                        raw: {
                            length: packet.raw.length,
                            timestamp: packet.raw.timestamp,
                            valid: packet.raw.valid,
                        },
                    })
                })
            })
    }

    private stopSniffing() {
        return procedure.input(z.object({})).mutation(async ({ store }) => {
            for (const [scanId, sniffer] of store.scan.toArray()) {
                sniffer.stopSniffing()
                store.scan.delete(scanId)
            }
            return true
        })
    }

    private isSniffing() {
        return procedure.input(z.object({})).query(async ({ store }) => {
            return store.scan.size() > 0
        })
    }

    static make() {
        const inst = new ScanController()

        return {
            start: inst.makeSniffing(),
            stop: inst.stopSniffing(),
            active: inst.isSniffing(),
        }
    }
}

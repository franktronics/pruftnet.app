import {
    NetworkSniffer,
    type PacketData as CPP_PacketData,
    type RawPacketData,
    type ParsedPacket,
} from '@repo/core-cpp'
import { z } from 'zod'
import { procedure, wsProcedure } from '../routes/root'
import { ServerError } from '../../../utils/src/trpc/server/server-error'

export type PacketDataWithoutRaw = {
    id: number
    parsed: ParsedPacket
    raw: Omit<RawPacketData, 'data'>
}

export interface PacketData {
    id: number
    parsed: ParsedPacket
    raw: RawPacketData<string>
}

export class ScanController {
    constructor() {}

    private makeSniffing() {
        return wsProcedure
            .input(
                z.object({
                    interface: z.string().nonempty(),
                }),
            )
            .handle(async ({ input, store }, returnCb: (data: PacketDataWithoutRaw) => void) => {
                const sniffer = new NetworkSniffer(
                    store.settings.get('settings')?.protocolEntryFile || '',
                )
                const scanId = Date.now()
                store.scan.set(scanId, sniffer)

                let counter = 0
                try {
                    sniffer.startSniffing(input.interface, (packet: CPP_PacketData) => {
                        store.packets.set(counter, packet)
                        returnCb({
                            id: counter,
                            parsed: packet.parsed,
                            raw: {
                                length: packet.raw.length,
                                timestamp: packet.raw.timestamp - scanId,
                                valid: packet.raw.valid,
                            },
                        })
                        counter += 1
                    })
                } catch (err) {
                    console.error('Error starting sniffer:', err)
                }
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

    private getPacketData() {
        return procedure
            .input(z.object({ id: z.number().nullable() }))
            .query(async ({ input, store }): Promise<PacketData | null> => {
                if (input.id === null) {
                    new ServerError({
                        message: 'Cannot get data for the packet',
                        whatToDo: 'Ensure you provided a valid packet Id',
                        code: 404,
                    }).throw()
                    return null
                }
                const packet = store.packets.get(input.id)
                if (!packet) return null
                return {
                    id: input.id,
                    ...packet,
                    raw: {
                        ...packet.raw,
                        data: Buffer.from(packet.raw.data).toString('base64'),
                    },
                }
            })
    }

    private cleanup() {
        return procedure.input(z.object({})).mutation(async ({ store }) => {
            store.packets.clear()
            store.scan.clear()
            return true
        })
    }

    static make() {
        const inst = new ScanController()

        return {
            start: inst.makeSniffing(),
            stop: inst.stopSniffing(),
            active: inst.isSniffing(),
            packetData: inst.getPacketData(),
            cleanup: inst.cleanup(),
        }
    }
}

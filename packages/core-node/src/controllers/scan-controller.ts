import {
    NetworkSniffer,
    type PacketData as CPP_PacketData,
    type RawPacketData,
    type ParsedPacket,
} from '@repo/core-cpp'
import { z } from 'zod'
import { procedure, wsProcedure } from '../routes/root'
import { ServerError } from '../../../utils/src/trpc/server/server-error'
import PQueue from 'p-queue'

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

export type SniffingEvent =
    | { type: 'start' }
    | { type: 'error'; message: string }
    | ({ type: 'packet' } & PacketDataWithoutRaw)

export class ScanController {
    private PACKET_PROCESSING_DELAY = 0
    constructor() {}

    private async AddDalay(time: number) {
        if (time === 0) return true
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                resolve(true)
                clearTimeout(timer)
            }, time)
        })
    }

    private makeSniffing() {
        return wsProcedure
            .input(
                z.object({
                    interface: z.string().nonempty(),
                }),
            )
            .handle(async ({ input, store }, returnCb: (data: SniffingEvent) => void) => {
                const sniffer = new NetworkSniffer(
                    store.settings.get('settings')?.protocolEntryFile || '',
                )
                const queue = new PQueue({ concurrency: 1 })

                store.sniffer.set('sniffer', sniffer)
                store.snifferQueue.set('queue', queue)

                let counter = 0
                const startTime = Date.now()
                try {
                    sniffer.startSniffing(input.interface, async (packet: CPP_PacketData) => {
                        await queue.add(async () => {
                            store.packets.set(counter, packet)
                            returnCb({
                                type: 'packet',
                                id: counter,
                                parsed: packet.parsed,
                                raw: {
                                    length: packet.raw.length,
                                    timestamp: packet.raw.timestamp - startTime,
                                    valid: packet.raw.valid,
                                },
                            })
                            await this.AddDalay(this.PACKET_PROCESSING_DELAY)
                            counter += 1
                        })
                    })
                    returnCb({ type: 'start' })
                } catch (err: any) {
                    returnCb({ type: 'error', message: err?.message || 'Error starting sniffer' })
                    console.error('Error starting sniffer:', err)
                }
            })
    }

    private stopSniffing() {
        return procedure.input(z.object({})).mutation(async ({ store }) => {
            const sniffer = store.sniffer.get('sniffer')
            const snifferQueue = store.snifferQueue.get('queue')
            sniffer?.stopSniffing()
            await snifferQueue?.onIdle()

            store.sniffer.clear()
            store.snifferQueue.clear()

            return true
        })
    }

    private isSniffing() {
        return procedure.input(z.object({})).query(async ({ store }) => {
            const sniffer = store.sniffer.get('sniffer')
            const queue = store.snifferQueue.get('queue')
            return !!sniffer && !!queue
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
            store.sniffer.clear()
            store.snifferQueue.clear()
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

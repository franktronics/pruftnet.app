import { trpcServer } from '@repo/utils'
import { z } from 'zod'
import { NetworkSniffer, PacketParser, type RawPacketData, type ParsedPacket } from '@repo/core-cpp'

const { createWsRouter, wsProcedure } = trpcServer

const packetMap = new Map<number, RawPacketData>()
const sniffer = new NetworkSniffer()
let packetIndex = 0

export const appWsRouter = createWsRouter({
    network_sniffer: {
        start: wsProcedure
            .input(
                z.object({
                    interface: z.string(),
                }),
            )
            .handle(
                async (
                    input,
                    returnCb: (data: { packet: ParsedPacket; index: number }) => void,
                ) => {
                    try {
                        if (sniffer.isRunning()) {
                            throw new Error('Sniffer is already running')
                        }

                        const parser = new PacketParser()

                        sniffer.startSniffing(input.interface, (rawPacket) => {
                            try {
                                const parsedPacket = parser.parse(rawPacket.data)
                                packetMap.set(packetIndex, rawPacket)
                                returnCb({ packet: parsedPacket, index: packetIndex })
                                packetIndex += 1
                            } catch (parseError) {
                                console.error('Failed to parse packet:', parseError)
                            }
                        })
                    } catch (error) {
                        throw new Error(
                            `WebSocket sniffer error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        )
                    }
                },
            ),
        stop: wsProcedure
            .input(z.object({}))
            .handle(async (input, returnCb: (st: boolean) => void) => {
                console.log('Stopping sniffer via ws...')
                sniffer.stopSniffing()
                returnCb(true)
            }),
    },
})

export type AppWsRouter = typeof appWsRouter

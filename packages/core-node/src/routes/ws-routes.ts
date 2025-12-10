import { trpcServer } from '@repo/utils'
import { z } from 'zod'
import { NetworkSniffer, PacketParser, type RawPacketData, type ParsedPacket } from '@repo/core-cpp'

const { createWsRouter, wsProcedure } = trpcServer

export const appWsRouter = createWsRouter({
    network_sniffer: {
        start: wsProcedure
            .input(
                z.object({
                    interface: z.string(),
                }),
            )
            .handle(async (input, returnCb: (data: { packet: ParsedPacket; raw: RawPacketData }) => void) => {
                try {
                    const sniffer = new NetworkSniffer()
                    const parser = new PacketParser()
                    
                    sniffer.startSniffing(input.interface, (rawPacket) => {
                        try {
                            const parsedPacket = parser.parse(rawPacket.data)
                            returnCb({
                                packet: parsedPacket,
                                raw: rawPacket
                            })
                        } catch (parseError) {
                            console.error('Failed to parse packet:', parseError)
                        }
                    })
                } catch (error) {
                    throw new Error(
                        `WebSocket sniffer error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    )
                }
            }),
    },
})

export type AppWsRouter = typeof appWsRouter

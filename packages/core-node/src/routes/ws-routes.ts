import { trpcServer } from '@repo/utils'
import { z } from 'zod'
import {NetworkSniffer, type RawPacketData} from "@repo/core-cpp"

const { createWsRouter, wsProcedure } = trpcServer

export const appWsRouter = createWsRouter({
    network_sniffer: {
        start: wsProcedure
            .input(
                z.object({
                    interface: z.string(),
                }),
            )
            .handle(async (input, returnCb: (data: RawPacketData) => void) => {
                try {
                    const sniffer = new NetworkSniffer()
                    sniffer.startSniffing(input.interface, (packet) => {
                        returnCb(packet)
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

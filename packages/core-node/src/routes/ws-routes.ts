import { trpc } from '@repo/utils'
import { z } from 'zod'

const { createWsRouter, wsProcedure } = trpc

export const appWsRouter = createWsRouter({
    test: {
        echo: wsProcedure
            .input(
                z.object({
                    message: z.string(),
                }),
            )
            .handle(async (input, returnCb, { ws, req }) => {
                setInterval(() => {
                    if (ws.readyState === ws.OPEN) {
                        returnCb(JSON.stringify({ ping: 'pong', message: input.message }) )
                    }
                }, 10000)
            }),
    }
})

export type AppWsRouter = typeof appWsRouter
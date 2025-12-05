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
                        const date = new Date()
                        const data = JSON.stringify({ ping: 'pong', message: input.message, time: date }) 
                        returnCb(data)
                    }
                }, 1000)
            }),
    }
})

export type AppWsRouter = typeof appWsRouter
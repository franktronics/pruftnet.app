import { trpc } from '@repo/utils'
import { z } from 'zod'

const { createRouter, procedure } = trpc

export const appRouter = createRouter({
    scan: {
        start: procedure
            .input(
                z.object({
                    id: z.string(),
                }),
            )
            .query(async (input) => {
                const timer = (ms: number) => new Promise((res) => setTimeout(res, ms))
                await timer(5000)
                return { message: `Scan started for id: ${input.id}` }
            }),
        stop: procedure
            .input(
                z.object({
                    id: z.string(),
                }),
            )
            .mutation(async (input) => {
                return { message: `Scan stopped for id: ${input.id}` }
            }),
    },
    status: procedure.query(async () => {
        return { status: 'All systems operational' }
    }),
})

export type AppRouter = typeof appRouter

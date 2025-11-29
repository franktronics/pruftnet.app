import { trpc } from '@repo/utils'
import { type AppRouter } from '@repo/core-node'
const { createClient } = trpc

export const fetcher = createClient<AppRouter>({
    baseUrl: '/trpc',
    headers: {
        // Custom headers if needed
    },
})

import { detectPlatform, trpc } from '@repo/utils'
import { type AppRouter } from '@repo/core-node'
const { createClient } = trpc

export const fetcher = createClient<AppRouter>({
    baseHttpUrl: '/trpc',
    baseIPCPath: 'trpc',
    headers: {
        // Custom headers if needed
    },
    isDesktop: detectPlatform().isElectron,
})

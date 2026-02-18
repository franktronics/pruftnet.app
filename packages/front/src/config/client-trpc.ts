import { detectPlatform, trpcClient } from '@repo/utils'
import type { AppRouter, AppWsRouter } from '@repo/core-node'
const { createClient, createWsClient } = trpcClient

export const fetcher = createClient<AppRouter>({
    baseHttpUrl: '/trpc',
    baseIPCPath: 'trpc',
    headers: {
        // Custom headers if needed
    },
    isDesktop: detectPlatform().isElectron,
})

export const wsFetcher = createWsClient<AppWsRouter>({
    baseWsUrl: '/trpc-ws',
    isDesktop: detectPlatform().isElectron,
    iPCStreamPath: 'trpc-stream',
})

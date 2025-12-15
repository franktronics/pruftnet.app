import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'

const { createRouter } = trpcServer

export const appRouter = createRouter({
    scan: {
        stop: ScanController.make().stop,
        active: ScanController.make().active,
    },
})

export type AppRouter = typeof appRouter

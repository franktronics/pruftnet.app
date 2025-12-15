import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'

const { createWsRouter } = trpcServer

export const appWsRouter = createWsRouter({
    scan: {
        start: ScanController.make().start,
    },
})

export type AppWsRouter = typeof appWsRouter

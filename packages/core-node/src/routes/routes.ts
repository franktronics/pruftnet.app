import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'
import { InterfaceController } from '../controllers/interface-controller'

const { createRouter } = trpcServer

export const appRouter = createRouter({
    scan: {
        stop: ScanController.make().stop,
        active: ScanController.make().active,
    },
    interfaces: InterfaceController.make().list,
})

export type AppRouter = typeof appRouter

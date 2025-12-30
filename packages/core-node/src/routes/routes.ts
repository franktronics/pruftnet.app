import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'
import { InterfaceController } from '../controllers/interface-controller'
import { SettingsController } from '../controllers/settings-controller'

const { createRouter } = trpcServer

export const appRouter = createRouter({
    scan: {
        stop: ScanController.make().stop,
        active: ScanController.make().active,
    },
    interfaces: InterfaceController.make().list,
    settings: {
        get: SettingsController.make().get,
        update: SettingsController.make().update,
        reset: SettingsController.make().reset,
    },
})

export type AppRouter = typeof appRouter

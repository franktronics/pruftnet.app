import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'
import { InterfaceController } from '../controllers/interface-controller'
import { SettingsController } from '../controllers/settings-controller'
import { ProtocolFileController } from '../controllers/protocol-file-controller'
import { AnalysisController } from '../controllers/analysis-controller'
import { LoggerController } from '../controllers/logger-controller'
import { VendorOUIController } from '../controllers/vendor-oui-controller'

const { createRouter } = trpcServer

export const appRouter = createRouter({
    scan: {
        stop: ScanController.make().stop,
        active: ScanController.make().active,
        packetData: ScanController.make().packetData,
        cleanup: ScanController.make().cleanup,
    },
    interfaces: InterfaceController.make().list,
    settings: {
        get: SettingsController.make().get,
        update: SettingsController.make().update,
        reset: SettingsController.make().reset,
    },
    protocolFiles: {
        getById: ProtocolFileController.make().getById,
        getByPath: ProtocolFileController.make().getByPath,
    },
    analysis: {
        create: AnalysisController.make().create,
        store: AnalysisController.make().store,
        get: AnalysisController.make().get,
        getImage: AnalysisController.make().getImage,
        delete: AnalysisController.make().delete,
        list: AnalysisController.make().list,
    },
    logger: {
        create: LoggerController.make().create,
        list: LoggerController.make().list,
        clear: LoggerController.make().clear,
    },
    vendor: {
        getOui: VendorOUIController.make().get,
    },
})

export type AppRouter = typeof appRouter

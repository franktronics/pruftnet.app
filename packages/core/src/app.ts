import { Layer } from 'effect'

import { NetworkInterfaceLive } from './network-interface'
import {
    CaptureCatalog,
    CaptureHandlers,
    CaptureServiceLive,
    CaptureSessionManager,
    CaptureSessionRepository,
    CaptureRecovery,
    ExportDestination,
    ExportEncoder,
    ExportArtifactRepository,
    ExportScheduler,
    type ExportDestinationOptions,
} from './capture'
import {
    AppDataPaths,
    Database,
    InstanceLock,
    type AppDataPathsOptions,
    type DatabaseLayerOptions,
} from './storage'
import { ShutdownCoordinator } from './shutdown'
import { RealtimeHandlers, RealtimeHub } from './realtime'

export interface AppLayerOptions
    extends AppDataPathsOptions, ExportDestinationOptions, DatabaseLayerOptions {}

export function makeAppLayer(options: AppLayerOptions) {
    const realtime = RealtimeHub.layer
    const paths = AppDataPaths.layer(options)
    const lock = InstanceLock.layer.pipe(Layer.provideMerge(paths))
    const database = Database.layerWith(options).pipe(Layer.provideMerge(lock))
    const captureRepository = CaptureSessionRepository.layer.pipe(Layer.provideMerge(database))
    const exportRepository = ExportArtifactRepository.layer.pipe(Layer.provideMerge(database))
    const repositories = Layer.mergeAll(captureRepository, exportRepository)
    const captureDomain = Layer.mergeAll(repositories, CaptureServiceLive, realtime)
    const catalog = CaptureCatalog.layer.pipe(Layer.provideMerge(captureDomain))
    const recovery = CaptureRecovery.layer.pipe(Layer.provideMerge(captureDomain))
    const manager = CaptureSessionManager.layer.pipe(
        Layer.provideMerge(Layer.merge(captureDomain, recovery)),
    )
    const destination = ExportDestination.layer(options).pipe(Layer.provideMerge(paths))
    const schedulerInputs = Layer.mergeAll(
        captureDomain,
        catalog,
        manager,
        destination,
        ExportEncoder.layer,
    )
    const scheduler = ExportScheduler.layer.pipe(Layer.provideMerge(schedulerInputs))
    const shutdown = ShutdownCoordinator.layer.pipe(Layer.provideMerge(scheduler))
    const handlers = CaptureHandlers.pipe(
        Layer.provide(Layer.mergeAll(manager, catalog, scheduler, shutdown)),
    )
    const realtimeHandlers = RealtimeHandlers.pipe(Layer.provide(Layer.merge(manager, realtime)))
    return Layer.mergeAll(NetworkInterfaceLive, handlers, realtimeHandlers, shutdown, realtime)
}

import { CaptureRpcs } from '@repo/shared/capture'
import { Effect } from 'effect'

import { CaptureCatalog } from './catalog'
import { ExportScheduler } from './export-scheduler'
import { CaptureSessionManager } from './manager'
import { ShutdownCoordinator } from '#core/shutdown'

export const CaptureHandlers = CaptureRpcs.toLayer(
    Effect.gen(function* () {
        const capture = yield* CaptureSessionManager
        const catalog = yield* CaptureCatalog
        const exports = yield* ExportScheduler
        const shutdown = yield* ShutdownCoordinator
        const mutation = <A, E>(effect: Effect.Effect<A, E>) =>
            shutdown.assertAcceptingMutations().pipe(Effect.zipRight(effect))
        return {
            ListCaptureInterfaces: capture.listInterfaces,
            GetCaptureInterfaceCapabilities: ({ name, monitorMode }) =>
                capture.capabilities(name, monitorMode),
            StartCapture: ({ source }) => mutation(capture.start(source)),
            StopCapture: ({ captureId }) => capture.stop(captureId),
            GetCaptureSession: ({ captureId }) => capture.session(captureId),
            ReadPacketSummaries: ({ captureId, afterCursor, limit }) =>
                capture.summaries(captureId, afterCursor, limit),
            GetRegistrySnapshot: ({ registryRevision }) => capture.registry(registryRevision),
            GetCaptureStats: ({ captureId }) => capture.stats(captureId),
            ListCaptureStatSamples: ({ captureId, limit }) => capture.statSamples(captureId, limit),
            ReadCaptureEvents: ({ captureId, afterCursor, limit }) =>
                capture.events(captureId, afterCursor, limit),
            ListCaptures: catalog.list,
            GetCapture: ({ captureId }) => catalog.get(captureId),
            GetActiveCapture: catalog.active,
            OpenCapture: ({ captureId }) => catalog.open(captureId),
            DeleteCapture: ({ captureId }) => mutation(catalog.delete(captureId)),
            CreateExport: (request) => mutation(exports.create(request)),
            ListExportJobs: exports.list,
        }
    }),
)

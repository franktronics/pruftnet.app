import { CaptureRpcs } from '@repo/shared/capture'
import { Effect } from 'effect'

import { Capture } from './service'

export const CaptureHandlers = CaptureRpcs.toLayer(
    Effect.gen(function* () {
        const capture = yield* Capture
        return {
            ListCaptureInterfaces: capture.listInterfaces,
            GetCaptureInterfaceCapabilities: ({ name, monitorMode }) =>
                capture.capabilities(name, monitorMode),
            StartCapture: ({ source }) =>
                source._tag === 'Replay'
                    ? capture.startReplay(source.fileId)
                    : capture.startLive(source),
            StopCapture: ({ captureId }) => capture.stop(captureId),
            GetCaptureSession: ({ captureId }) => capture.session(captureId),
            ReadPacketSummaries: ({ captureId, afterCursor, limit }) =>
                capture.summaries(captureId, afterCursor, limit),
            GetRegistrySnapshot: ({ registryRevision }) => capture.registry(registryRevision),
            GetCaptureStats: ({ captureId }) => capture.stats(captureId),
            ReadCaptureEvents: ({ captureId, afterCursor, limit }) =>
                capture.events(captureId, afterCursor, limit),
        }
    }),
)

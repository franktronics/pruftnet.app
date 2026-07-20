import { RealtimeRpcs } from '@repo/shared/realtime'
import { Effect, Stream } from 'effect'

import { CaptureSessionManager } from '#core/capture'

import { RealtimeHub } from './hub'

export const RealtimeHandlers = RealtimeRpcs.toLayer(
    Effect.gen(function* () {
        const capture = yield* CaptureSessionManager
        const realtime = yield* RealtimeHub
        return {
            WatchApplicationChanges: () => realtime.applicationChanges,
            WatchCaptureChanges: ({ captureId }) =>
                Stream.unwrap(
                    capture.session(captureId).pipe(Effect.as(realtime.captureChanges(captureId))),
                ),
        }
    }),
)

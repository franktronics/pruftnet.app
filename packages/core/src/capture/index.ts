import { Effect, Layer, Schema } from 'effect'

import { CaptureHandlers } from './handlers'
import { CaptureWorker } from './replay-worker'
import { Capture } from './service'
import { resolveCaptureWorkerPath } from './worker-path'

const ReplayFiles = Schema.Record({ key: Schema.String, value: Schema.String })

const loadWorkerOptions = Effect.try({
    try: () => ({
        executablePath: resolveCaptureWorkerPath(process.cwd()),
        replayFiles: process.env.PRUFTNET_REPLAY_FILES
            ? Schema.decodeUnknownSync(ReplayFiles)(JSON.parse(process.env.PRUFTNET_REPLAY_FILES))
            : {},
    }),
    catch: (cause) => new Error(`Invalid capture worker configuration: ${String(cause)}`),
})

const CaptureWorkerLive = Layer.unwrapEffect(
    loadWorkerOptions.pipe(Effect.map(CaptureWorker.layer)),
)
const CaptureServiceLive = Capture.layer.pipe(Layer.provide(CaptureWorkerLive))

export const CaptureLive = Layer.merge(
    CaptureServiceLive,
    CaptureHandlers.pipe(Layer.provide(CaptureServiceLive)),
)

export { Capture, CaptureWorker }

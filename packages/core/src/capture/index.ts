import { resolve } from 'node:path'

import { Effect, Layer, Schema } from 'effect'

import { CaptureHandlers } from './handlers'
import { ReplayWorker } from './replay-worker'
import { Capture } from './service'

const ReplayFiles = Schema.Record({ key: Schema.String, value: Schema.String })

const loadWorkerOptions = Effect.try({
    try: () => ({
        executablePath:
            process.env.PRUFTNET_REPLAY_WORKER_PATH ??
            resolve(process.cwd(), 'packages/core/cpp/build/pruftnet_replay_worker'),
        replayFiles: process.env.PRUFTNET_REPLAY_FILES
            ? Schema.decodeUnknownSync(ReplayFiles)(JSON.parse(process.env.PRUFTNET_REPLAY_FILES))
            : {},
    }),
    catch: (cause) => new Error(`Invalid replay worker configuration: ${String(cause)}`),
})

const ReplayWorkerLive = Layer.unwrapEffect(loadWorkerOptions.pipe(Effect.map(ReplayWorker.layer)))
const CaptureServiceLive = Capture.layer.pipe(Layer.provide(ReplayWorkerLive))

export const CaptureLive = Layer.merge(
    CaptureServiceLive,
    CaptureHandlers.pipe(Layer.provide(CaptureServiceLive)),
)

export { Capture, ReplayWorker }

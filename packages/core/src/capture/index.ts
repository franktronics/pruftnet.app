import { Effect, Layer, Schema } from 'effect'

import { CaptureHandlers } from './handlers'
import { CaptureWorker } from './replay-worker'
import { Capture } from './service'
import { captureWorkerExecutableName, resolveCaptureWorkerPath } from './worker-path'

const ReplayFiles = Schema.Record({ key: Schema.String, value: Schema.String })

export interface CaptureLayerOptions {
    /** Absolute path of the bundled worker. Source checkouts search the CMake build tree. */
    readonly captureWorkerPath?: string
}

const loadWorkerOptions = (options: CaptureLayerOptions) =>
    Effect.try({
        try: () => ({
            executablePath: options.captureWorkerPath ?? resolveCaptureWorkerPath(process.cwd()),
            replayFiles: process.env.PRUFTNET_REPLAY_FILES
                ? Schema.decodeUnknownSync(ReplayFiles)(
                      JSON.parse(process.env.PRUFTNET_REPLAY_FILES),
                  )
                : {},
        }),
        catch: (cause) => new Error(`Invalid capture worker configuration: ${String(cause)}`),
    })

export function makeCaptureLayer(options: CaptureLayerOptions) {
    return Capture.layer.pipe(
        Layer.provide(
            Layer.unwrapEffect(loadWorkerOptions(options).pipe(Effect.map(CaptureWorker.layer))),
        ),
    )
}

export { Capture, CaptureWorker, captureWorkerExecutableName, resolveCaptureWorkerPath }
export type { CaptureService } from './service'
export { CaptureHandlers }
export * from './capture-session-repository'
export * from './catalog'
export * from './export-destination'
export * from './export-download-http'
export * from './export-encoder'
export * from './export-repository'
export * from './export-scheduler'
export * from './manager'
export * from './recovery'

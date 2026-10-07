import { Capture, makeCaptureLayer, type CaptureService } from '@repo/core'
import { Effect } from 'effect'

import type { RuntimePaths } from '#server/runtime-paths'

/** Runs `use` against a short-lived native worker, which is stopped afterwards. */
export function withCaptureWorker<A, E>(
    paths: RuntimePaths,
    use: (capture: CaptureService) => Effect.Effect<A, E>,
) {
    return Effect.flatMap(Capture, use).pipe(
        Effect.provide(makeCaptureLayer({ captureWorkerPath: paths.captureWorkerPath })),
    )
}

/** Human-readable text for worker and capture errors, which carry a `title`. */
export function describeError(error: unknown) {
    if (typeof error === 'object' && error !== null && 'title' in error) {
        const { title, message } = error as { title: unknown; message?: unknown }
        return typeof message === 'string' && message !== '' && message !== title
            ? `${String(title)}: ${message}`
            : String(title)
    }
    return error instanceof Error ? error.message : String(error)
}

import { spawn } from 'node:child_process'

import { Effect } from 'effect'
import { expect, test } from 'vitest'

import { ReplayWorker } from './replay-worker'

test('a timeout terminates the worker and rejects later calls', async () => {
    const fixture = new URL('./test-fixtures/late-worker.cjs', import.meta.url).pathname
    const exits = await Effect.runPromise(
        Effect.gen(function* () {
            const worker = yield* ReplayWorker
            const first = yield* worker.request({ op: 'slow' }).pipe(Effect.exit)
            yield* Effect.sleep('30 millis')
            const second = yield* worker.request({ op: 'next' }).pipe(Effect.exit)
            return [first, second] as const
        }).pipe(
            Effect.provide(
                ReplayWorker.layer({
                    executablePath: process.execPath,
                    replayFiles: {},
                    responseTimeoutMs: 10,
                    spawn: () => spawn(process.execPath, [fixture]),
                }),
            ),
        ),
    )

    expect(exits[0]._tag).toBe('Failure')
    expect(exits[1]._tag).toBe('Failure')
    if (exits[0]._tag === 'Failure') expect(String(exits[0].cause)).toContain('timed out')
})

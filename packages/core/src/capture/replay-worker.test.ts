import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Effect, Fiber } from 'effect'
import { expect, test } from 'vitest'

import { ReplayWorker } from './replay-worker'

test('a timed-out response is drained and later requests remain usable', async () => {
    const fixture = fileURLToPath(new URL('./test-fixtures/late-worker.cjs', import.meta.url))
    const exits = await Effect.runPromise(
        Effect.gen(function* () {
            const worker = yield* ReplayWorker
            const first = yield* worker.request({ op: 'slow' }).pipe(Effect.exit)
            yield* Effect.sleep('120 millis')
            const second = yield* worker.request({ op: 'next' }).pipe(Effect.exit)
            return [first, second] as const
        }).pipe(
            Effect.provide(
                ReplayWorker.layer({
                    executablePath: process.execPath,
                    replayFiles: {},
                    responseTimeoutMs: 50,
                    spawn: () => spawn(process.execPath, [fixture]),
                }),
            ),
        ),
    )

    expect(exits[0]._tag).toBe('Failure')
    expect(exits[1]._tag).toBe('Success')
    if (exits[0]._tag === 'Failure') expect(String(exits[0].cause)).toContain('timed out')
})

test.each([true, false])(
    'cancellation preserves worker synchronization (native support: %s)',
    async (supportsCancellation) => {
        const fixture = fileURLToPath(new URL('./test-fixtures/late-worker.cjs', import.meta.url))
        const detailPath = join(tmpdir(), `detail-cancelled-${process.pid}.prt2`)
        const next = await Effect.runPromise(
            Effect.gen(function* () {
                const worker = yield* ReplayWorker
                yield* worker.request({ op: 'hello' })
                const cancelled = yield* Effect.fork(
                    worker.request({ op: 'detail', testPath: detailPath }),
                )
                yield* Effect.sleep('2 millis')
                yield* Fiber.interrupt(cancelled)
                const response = yield* worker.request({ op: 'next' })
                yield* Effect.sleep('120 millis')
                return response
            }).pipe(
                Effect.provide(
                    ReplayWorker.layer({
                        executablePath: process.execPath,
                        replayFiles: {},
                        responseTimeoutMs: 200,
                        spawn: () =>
                            spawn(
                                process.execPath,
                                supportsCancellation ? [fixture] : [fixture, '--legacy'],
                            ),
                    }),
                ),
            ),
        )

        expect(next).toMatchObject({
            ok: true,
            op: 'next',
            cancelled: supportsCancellation ? ['2'] : [],
        })
        expect(existsSync(detailPath)).toBe(false)
    },
)

test('worker failure retains stderr delivered after the process exit event', async () => {
    const diagnostic = 'Npcap is required. Install it from https://npcap.com/'
    const result = await Effect.runPromise(
        Effect.gen(function* () {
            const worker = yield* ReplayWorker
            return yield* worker.request({ op: 'hello' }).pipe(Effect.either)
        }).pipe(
            Effect.provide(
                ReplayWorker.layer({
                    executablePath: process.execPath,
                    replayFiles: {},
                    spawn: () => {
                        const child = spawn(process.execPath, [
                            '-e',
                            `process.stderr.write(${JSON.stringify(diagnostic)}); process.exitCode = 1`,
                        ])
                        // Reproduce exit arriving before the stderr pipe is drained.
                        child.once('spawn', () => child.emit('exit', 1, null))
                        return child
                    },
                }),
            ),
        ),
    )
    expect(result).toMatchObject({
        _tag: 'Left',
        left: { reason: 'exit', message: expect.stringContaining(diagnostic) },
    })
})

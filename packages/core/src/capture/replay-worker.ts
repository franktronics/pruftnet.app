import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { Context, Effect, Layer, Schema } from 'effect'

const MAX_COMMAND_BYTES = 64 * 1024
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const RESPONSE_TIMEOUT_MS = 10_000
const EXIT_GRACE_MS = 1_000

const WorkerEnvelope = Schema.Struct({
    v: Schema.Literal(1),
    id: Schema.String,
    ok: Schema.Boolean,
})

export class ReplayWorkerError extends Schema.TaggedError<ReplayWorkerError>()(
    'ReplayWorkerError',
    {
        reason: Schema.Literal('spawn', 'write', 'timeout', 'protocol', 'response_limit', 'exit'),
        message: Schema.String,
    },
) {}

export interface ReplayWorkerOptions {
    readonly executablePath: string
    readonly replayFiles: Readonly<Record<string, string>>
    readonly responseTimeoutMs?: number
    readonly spawn?: (
        executable: string,
        args: ReadonlyArray<string>,
    ) => ChildProcessWithoutNullStreams
}

const awaitExit = (child: ChildProcessWithoutNullStreams) =>
    Effect.async<void>((resume) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resume(Effect.void)
            return
        }
        let forced = false
        const done = () => {
            clearTimeout(forceTimer)
            clearTimeout(boundTimer)
            resume(Effect.void)
        }
        child.once('exit', done)
        const forceTimer = setTimeout(() => {
            forced = true
            child.kill('SIGKILL')
        }, EXIT_GRACE_MS)
        const boundTimer = setTimeout(done, EXIT_GRACE_MS * 2)
        return Effect.sync(() => {
            child.off('exit', done)
            clearTimeout(forceTimer)
            clearTimeout(boundTimer)
            if (!forced && child.exitCode === null) child.kill('SIGKILL')
        })
    })

export class ReplayWorker extends Context.Tag('@repo/core/capture/ReplayWorker')<
    ReplayWorker,
    {
        readonly request: (
            command: Readonly<Record<string, unknown>>,
        ) => Effect.Effect<unknown, ReplayWorkerError>
    }
>() {
    static layer(options: ReplayWorkerOptions) {
        return Layer.scoped(
            ReplayWorker,
            Effect.gen(function* () {
                const child = yield* Effect.acquireRelease(
                    Effect.sync(() =>
                        (options.spawn ?? ((executable, args) => spawn(executable, args)))(
                            options.executablePath,
                            Object.entries(options.replayFiles).map(
                                ([id, path]) => `--allow=${id}=${path}`,
                            ),
                        ),
                    ),
                    (process) =>
                        Effect.gen(function* () {
                            if (process.exitCode === null && process.signalCode === null)
                                process.kill('SIGTERM')
                            yield* awaitExit(process)
                        }),
                )
                const semaphore = yield* Effect.makeSemaphore(1)
                let sequence = 0
                let stdout = ''
                let stderr = ''
                let terminal: ReplayWorkerError | undefined

                const terminate = (error: ReplayWorkerError) => {
                    terminal ??= error
                    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
                    return terminal
                }
                child.stderr.setEncoding('utf8')
                child.stderr.on('data', (chunk: string) => {
                    stderr = (stderr + chunk).slice(-MAX_STDERR_BYTES)
                })
                child.on('exit', (code, signal) => {
                    terminal ??= new ReplayWorkerError({
                        reason: 'exit',
                        message: `Replay worker exited (code ${String(code)}, signal ${String(signal)})${stderr ? `: ${stderr}` : ''}`,
                    })
                })
                child.on('error', (error) => {
                    terminal ??= new ReplayWorkerError({
                        reason: 'spawn',
                        message: `Replay worker error: ${error.message}`,
                    })
                })
                child.stdout.setEncoding('utf8')
                child.stdout.on('data', (chunk: string) => {
                    stdout += chunk
                })

                const request = Effect.fn('ReplayWorker.request')(function* (
                    command: Readonly<Record<string, unknown>>,
                ) {
                    return yield* semaphore.withPermits(1)(
                        Effect.gen(function* () {
                            if (terminal) return yield* terminal
                            const id = String(++sequence)
                            const line = JSON.stringify({ v: 1, id, ...command }) + '\n'
                            if (Buffer.byteLength(line) > MAX_COMMAND_BYTES) {
                                return yield* new ReplayWorkerError({
                                    reason: 'protocol',
                                    message: 'Replay worker command exceeds the maximum line size',
                                })
                            }
                            yield* Effect.async<void, ReplayWorkerError>((resume) => {
                                child.stdin.write(line, (error) =>
                                    resume(
                                        error
                                            ? Effect.fail(
                                                  terminate(
                                                      new ReplayWorkerError({
                                                          reason: 'write',
                                                          message: error.message,
                                                      }),
                                                  ),
                                              )
                                            : Effect.void,
                                    ),
                                )
                            })
                            const responseLine = yield* Effect.async<string, ReplayWorkerError>(
                                (resume) => {
                                    let settled = false
                                    const finish = (
                                        effect: Effect.Effect<string, ReplayWorkerError>,
                                    ) => {
                                        if (settled) return
                                        settled = true
                                        clearInterval(poll)
                                        clearTimeout(timeout)
                                        resume(effect)
                                    }
                                    const poll = setInterval(() => {
                                        if (terminal) return finish(Effect.fail(terminal))
                                        if (Buffer.byteLength(stdout) > MAX_RESPONSE_BYTES) {
                                            return finish(
                                                Effect.fail(
                                                    terminate(
                                                        new ReplayWorkerError({
                                                            reason: 'response_limit',
                                                            message:
                                                                'Replay worker response exceeds the maximum line size',
                                                        }),
                                                    ),
                                                ),
                                            )
                                        }
                                        const newline = stdout.indexOf('\n')
                                        if (newline < 0) return
                                        const value = stdout.slice(0, newline)
                                        stdout = stdout.slice(newline + 1)
                                        finish(Effect.succeed(value))
                                    }, 1)
                                    const timeout = setTimeout(
                                        () =>
                                            finish(
                                                Effect.fail(
                                                    terminate(
                                                        new ReplayWorkerError({
                                                            reason: 'timeout',
                                                            message:
                                                                'Replay worker response timed out',
                                                        }),
                                                    ),
                                                ),
                                            ),
                                        options.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS,
                                    )
                                    return Effect.sync(() => {
                                        clearInterval(poll)
                                        clearTimeout(timeout)
                                        terminate(
                                            new ReplayWorkerError({
                                                reason: 'protocol',
                                                message: 'Replay worker request was interrupted',
                                            }),
                                        )
                                    })
                                },
                            )
                            const parsed = yield* Effect.try({
                                try: () => JSON.parse(responseLine) as unknown,
                                catch: (cause) =>
                                    terminate(
                                        new ReplayWorkerError({
                                            reason: 'protocol',
                                            message: `Replay worker returned invalid JSON: ${String(cause)}`,
                                        }),
                                    ),
                            })
                            const envelope = yield* Schema.decodeUnknown(WorkerEnvelope)(
                                parsed,
                            ).pipe(
                                Effect.mapError((cause) =>
                                    terminate(
                                        new ReplayWorkerError({
                                            reason: 'protocol',
                                            message: `Replay worker returned an invalid envelope: ${String(cause)}`,
                                        }),
                                    ),
                                ),
                            )
                            if (envelope.id !== id) {
                                return yield* terminate(
                                    new ReplayWorkerError({
                                        reason: 'protocol',
                                        message: `Replay worker response ID ${envelope.id} does not match request ID ${id}`,
                                    }),
                                )
                            }
                            return parsed
                        }),
                    )
                })
                return ReplayWorker.of({ request })
            }),
        )
    }
}

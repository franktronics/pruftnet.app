import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { basename, isAbsolute } from 'node:path'

import { Context, Effect, Either, Layer, Schema } from 'effect'

const MAX_COMMAND_BYTES = 64 * 1024
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_STDERR_BYTES = 64 * 1024
const MAX_PENDING_REQUESTS = 1024
const RESPONSE_TIMEOUT_MS = 10_000
const SHUTDOWN_GRACE_MS = 500
const EXIT_GRACE_MS = 1_500

const WorkerResponseEnvelope = Schema.Struct({
    v: Schema.Literal(2),
    kind: Schema.Literal('response'),
    id: Schema.String,
    ok: Schema.Boolean,
    features: Schema.optional(Schema.Array(Schema.String)),
})
const WorkerEventEnvelope = Schema.Struct({
    v: Schema.Literal(2),
    kind: Schema.Literal('event'),
    event: Schema.String,
})

export class ReplayWorkerError extends Schema.TaggedError<ReplayWorkerError>()(
    'ReplayWorkerError',
    {
        reason: Schema.Literal(
            'spawn',
            'write',
            'timeout',
            'protocol',
            'response_limit',
            'capacity',
            'exit',
        ),
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

interface PendingResponse {
    resume?: (effect: Effect.Effect<unknown, ReplayWorkerError>) => void
    timeout: ReturnType<typeof setTimeout>
}

function frame(payload: string): Buffer {
    const body = Buffer.from(payload)
    const framed = Buffer.allocUnsafe(4 + body.byteLength)
    framed.writeUInt32LE(body.byteLength, 0)
    body.copy(framed, 4)
    return framed
}

function cleanupUnclaimedDetail(value: unknown) {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('dataPath' in value) ||
        typeof value.dataPath !== 'string' ||
        !isAbsolute(value.dataPath) ||
        !basename(value.dataPath).startsWith('detail-') ||
        !basename(value.dataPath).endsWith('.prt2')
    )
        return
    void unlink(value.dataPath).catch(() => undefined)
}

const gracefulExit = (child: ChildProcessWithoutNullStreams, sequence: number) =>
    Effect.async<void>((resume) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resume(Effect.void)
            return
        }
        let settled = false
        const finish = () => {
            if (settled) return
            settled = true
            clearTimeout(termTimer)
            clearTimeout(killTimer)
            child.off('exit', finish)
            resume(Effect.void)
        }
        child.once('exit', finish)
        child.stdin.write(
            frame(JSON.stringify({ v: 2, id: `shutdown-${sequence}`, op: 'shutdown' })),
            () => undefined,
        )
        const termTimer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
        }, SHUTDOWN_GRACE_MS)
        const killTimer = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
            finish()
        }, EXIT_GRACE_MS)
        return Effect.sync(() => {
            clearTimeout(termTimer)
            clearTimeout(killTimer)
            child.off('exit', finish)
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
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
                let sequence = 0
                const child = yield* Effect.acquireRelease(
                    Effect.sync(() =>
                        (options.spawn ?? ((executable, args) => spawn(executable, args)))(
                            options.executablePath,
                            Object.entries(options.replayFiles).map(
                                ([id, path]) => `--allow=${id}=${path}`,
                            ),
                        ),
                    ),
                    (process) => gracefulExit(process, sequence),
                )
                let stderr = ''
                let stdout = Buffer.alloc(0)
                let terminal: ReplayWorkerError | undefined
                const pending = new Map<string, PendingResponse>()

                const setTerminal = (error: ReplayWorkerError) => {
                    if (terminal) return terminal
                    terminal = error
                    for (const [id, response] of pending) {
                        clearTimeout(response.timeout)
                        response.resume?.(Effect.fail(error))
                        pending.delete(id)
                    }
                    return error
                }
                const terminate = (error: ReplayWorkerError) => {
                    const failure = setTerminal(error)
                    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
                    return failure
                }
                const protocolFailure = (message: string) =>
                    terminate(new ReplayWorkerError({ reason: 'protocol', message }))

                child.stderr.setEncoding('utf8')
                child.stderr.on('data', (chunk: string) => {
                    stderr = (stderr + chunk).slice(-MAX_STDERR_BYTES)
                })
                child.on('exit', (code, signal) => {
                    setTerminal(
                        new ReplayWorkerError({
                            reason: 'exit',
                            message: `Capture worker exited (code ${String(code)}, signal ${String(signal)})${stderr ? `: ${stderr}` : ''}`,
                        }),
                    )
                })
                child.on('error', (error) => {
                    setTerminal(
                        new ReplayWorkerError({
                            reason: 'spawn',
                            message: `Capture worker error: ${error.message}`,
                        }),
                    )
                })
                child.stdin.on('error', (error) => {
                    terminate(new ReplayWorkerError({ reason: 'write', message: error.message }))
                })
                let supportsDetailCancellation = false
                child.stdout.on('data', (chunk: Buffer) => {
                    if (terminal) return
                    stdout = Buffer.concat([stdout, chunk])
                    while (stdout.byteLength >= 4) {
                        const length = stdout.readUInt32LE(0)
                        if (length > MAX_RESPONSE_BYTES) {
                            terminate(
                                new ReplayWorkerError({
                                    reason: 'response_limit',
                                    message:
                                        'Capture worker frame exceeds the maximum response size',
                                }),
                            )
                            return
                        }
                        if (stdout.byteLength < 4 + length) return
                        const body = stdout.subarray(4, 4 + length)
                        stdout = stdout.subarray(4 + length)
                        let parsed: unknown
                        try {
                            parsed = JSON.parse(body.toString('utf8')) as unknown
                        } catch (cause) {
                            protocolFailure(
                                `Capture worker returned invalid JSON: ${String(cause)}`,
                            )
                            return
                        }
                        const event = Schema.decodeUnknownEither(WorkerEventEnvelope)(parsed)
                        if (Either.isRight(event)) continue
                        const decoded = Schema.decodeUnknownEither(WorkerResponseEnvelope)(parsed)
                        if (Either.isLeft(decoded)) {
                            protocolFailure(
                                `Capture worker returned an invalid response envelope: ${String(decoded.left)}`,
                            )
                            return
                        }
                        if (decoded.right.features?.includes('detailCancellation'))
                            supportsDetailCancellation = true
                        const response = pending.get(decoded.right.id)
                        if (!response) {
                            if (decoded.right.id.startsWith('shutdown-')) continue
                            protocolFailure(
                                `Capture worker returned an unknown response ID ${decoded.right.id}`,
                            )
                            return
                        }
                        pending.delete(decoded.right.id)
                        clearTimeout(response.timeout)
                        if (response.resume) response.resume(Effect.succeed(parsed))
                        else cleanupUnclaimedDetail(parsed)
                    }
                })

                const request = Effect.fn('ReplayWorker.request')(function* (
                    command: Readonly<Record<string, unknown>>,
                ) {
                    if (terminal) return yield* terminal
                    if (pending.size >= MAX_PENDING_REQUESTS) {
                        return yield* new ReplayWorkerError({
                            reason: 'capacity',
                            message: 'Capture worker request capacity is exhausted',
                        })
                    }
                    const id = String(++sequence)
                    const payload = JSON.stringify({ v: 2, id, ...command })
                    const cancelDetail = () => {
                        if (!supportsDetailCancellation) return
                        if (command.op !== 'detail' && command.op !== 'detailStored') return
                        child.stdin.write(
                            frame(JSON.stringify({ v: 2, op: 'cancel', target: id })),
                            () => undefined,
                        )
                    }
                    if (Buffer.byteLength(payload) > MAX_COMMAND_BYTES) {
                        return yield* new ReplayWorkerError({
                            reason: 'protocol',
                            message: 'Capture worker command exceeds the maximum frame size',
                        })
                    }
                    return yield* Effect.async<unknown, ReplayWorkerError>((resume) => {
                        let active = true
                        const timeout = setTimeout(() => {
                            if (!active) return
                            active = false
                            const response = pending.get(id)
                            if (response) response.resume = undefined
                            cancelDetail()
                            resume(
                                Effect.fail(
                                    new ReplayWorkerError({
                                        reason: 'timeout',
                                        message: 'Capture worker response timed out',
                                    }),
                                ),
                            )
                        }, options.responseTimeoutMs ?? RESPONSE_TIMEOUT_MS)
                        pending.set(id, {
                            timeout,
                            resume: (effect) => {
                                if (!active) return
                                active = false
                                resume(effect)
                            },
                        })
                        child.stdin.write(frame(payload), (error) => {
                            if (!error || !active) return
                            active = false
                            clearTimeout(timeout)
                            pending.delete(id)
                            resume(
                                Effect.fail(
                                    terminate(
                                        new ReplayWorkerError({
                                            reason: 'write',
                                            message: error.message,
                                        }),
                                    ),
                                ),
                            )
                        })
                        return Effect.sync(() => {
                            if (!active) return
                            active = false
                            clearTimeout(timeout)
                            const response = pending.get(id)
                            if (response) response.resume = undefined
                            cancelDetail()
                        })
                    })
                })
                return ReplayWorker.of({ request })
            }),
        )
    }
}

export { ReplayWorker as CaptureWorker, ReplayWorkerError as CaptureWorkerError }
export type CaptureWorkerOptions = ReplayWorkerOptions

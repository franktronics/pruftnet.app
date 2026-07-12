import { Cause, Effect, Layer } from 'effect'
import { describe, expect, test } from 'vitest'

import { ReplayWorker } from './replay-worker'
import { Capture } from './service'

const provideCapture = <A, E>(effect: Effect.Effect<A, E, Capture>, response: unknown) =>
    Effect.runPromise(
        effect.pipe(
            Effect.provide(Capture.layer),
            Effect.provide(
                Layer.succeed(
                    ReplayWorker,
                    ReplayWorker.of({ request: () => Effect.succeed(response) }),
                ),
            ),
        ),
    )

describe('Capture', () => {
    test('converts capture halves to canonical hex and preserves u64 decimal strings', async () => {
        const session = await provideCapture(
            Effect.gen(function* () {
                return yield* (yield* Capture).startReplay('fixture')
            }),
            {
                v: 1,
                id: '1',
                ok: true,
                captureHigh: '1',
                captureLow: '18446744073709551615',
                state: 'completed',
                registryRevision: '18446744073709551615',
                startedAtNs: '9007199254740993',
                stoppedAtNs: '9007199254740994',
                failure: null,
            },
        )

        expect(session.captureId).toBe('0000000000000001ffffffffffffffff')
        expect(session.registryRevision).toBe('18446744073709551615')
        expect(session.startedAtNs).toBe('9007199254740993')
        expect(session.stoppedAtNs).toBe('9007199254740994')
        expect(session.source).toEqual({ _tag: 'Replay', fileId: 'fixture' })
    })

    test('adapts summaries and sends the cursor as a decimal string', async () => {
        let command: Readonly<Record<string, unknown>> | undefined
        const worker = ReplayWorker.of({
            request: (value) => {
                command = value
                if (value.op === 'start') {
                    return Effect.succeed({
                        v: 1,
                        id: '1',
                        ok: true,
                        captureHigh: '0',
                        captureLow: '1',
                        state: 'completed',
                        registryRevision: '2',
                        startedAtNs: '1',
                        stoppedAtNs: '2',
                        failure: null,
                    })
                }
                return Effect.succeed({
                    v: 1,
                    id: '1',
                    ok: true,
                    captureHigh: '0',
                    captureLow: '1',
                    firstCursor: '1',
                    lastCursor: '1',
                    oldestAvailableCursor: '1',
                    newestAvailableCursor: '1',
                    gapBeforeFirst: false,
                    captureComplete: true,
                    summaries: [
                        {
                            cursor: '1',
                            captureHigh: '0',
                            captureLow: '1',
                            packetId: '18446744073709551615',
                            timestampNs: '9007199254740993',
                            interfaceId: 0,
                            capturedLength: 64,
                            wireLength: 64,
                            linkType: 1,
                            captureFlags: 0,
                            parseCondition: 'complete',
                            protocolPath: [1],
                            columns: [
                                { key: 'source', value: '192.0.2.1' },
                                { key: 'destination', value: '198.51.100.2' },
                                { key: 'protocol', value: 'TCP' },
                                { key: 'length', value: '64' },
                                { key: 'info', value: '12345 -> 80' },
                            ],
                            analysisRevision: '2',
                        },
                    ],
                })
            },
        })
        const batch = await Effect.runPromise(
            Effect.gen(function* () {
                const capture = yield* Capture
                yield* capture.startReplay('fixture')
                return yield* capture.summaries('00000000000000000000000000000001', '7', 10)
            }).pipe(
                Effect.provide(Capture.layer),
                Effect.provide(Layer.succeed(ReplayWorker, worker)),
            ),
        )

        expect(command).toEqual({
            op: 'summaries',
            captureHigh: '0',
            captureLow: '1',
            cursor: '7',
            limit: 10,
        })
        expect(batch.summaries[0]?.key).toEqual({
            captureId: '00000000000000000000000000000001',
            packetId: '18446744073709551615',
        })
        expect(batch.summaries[0]?.timestampNs).toBe('9007199254740993')
        expect(batch.summaries[0]?.columns).toEqual([
            { key: 'source', value: '192.0.2.1' },
            { key: 'destination', value: '198.51.100.2' },
            { key: 'protocol', value: 'TCP' },
            { key: 'length', value: '64' },
            { key: 'info', value: '12345 -> 80' },
        ])
    })

    test('rejects malformed worker output at the service boundary', async () => {
        const result = await Effect.runPromiseExit(
            Effect.gen(function* () {
                return yield* (yield* Capture).listInterfaces()
            }).pipe(
                Effect.provide(Capture.layer),
                Effect.provide(
                    Layer.succeed(
                        ReplayWorker,
                        ReplayWorker.of({ request: () => Effect.succeed({ ok: true }) }),
                    ),
                ),
            ),
        )

        expect(result._tag).toBe('Failure')
        if (result._tag === 'Failure')
            expect(String(result.cause)).toContain('CaptureWorkerCrashed')
    })

    test('rejects a stale packet identity inside a matching summary response', async () => {
        const worker = ReplayWorker.of({
            request: (command) =>
                Effect.succeed(
                    command.op === 'start'
                        ? {
                              v: 1,
                              id: '1',
                              ok: true,
                              captureHigh: '0',
                              captureLow: '1',
                              state: 'completed',
                              registryRevision: '1',
                              startedAtNs: '1',
                              stoppedAtNs: '2',
                              failure: null,
                          }
                        : {
                              v: 1,
                              id: '2',
                              ok: true,
                              captureHigh: '0',
                              captureLow: '1',
                              firstCursor: '1',
                              lastCursor: '1',
                              oldestAvailableCursor: '1',
                              newestAvailableCursor: '1',
                              gapBeforeFirst: false,
                              captureComplete: true,
                              summaries: [
                                  {
                                      cursor: '1',
                                      captureHigh: '0',
                                      captureLow: '2',
                                      packetId: '1',
                                      timestampNs: '1',
                                      interfaceId: 0,
                                      capturedLength: 1,
                                      wireLength: 1,
                                      linkType: 1,
                                      captureFlags: 0,
                                      parseCondition: 'complete',
                                      protocolPath: [1],
                                      columns: [],
                                      analysisRevision: '1',
                                  },
                              ],
                          },
                ),
        })
        const exit = await Effect.runPromiseExit(
            Effect.gen(function* () {
                const capture = yield* Capture
                const session = yield* capture.startReplay('fixture')
                return yield* capture.summaries(session.captureId, undefined, 1)
            }).pipe(
                Effect.provide(Capture.layer),
                Effect.provide(Layer.succeed(ReplayWorker, worker)),
            ),
        )
        expect(exit._tag).toBe('Failure')
        if (exit._tag === 'Failure') expect(String(exit.cause)).toContain('CaptureNotFound')
    })

    test('serializes concurrent starts and sends only one start command', async () => {
        let starts = 0
        const worker = ReplayWorker.of({
            request: () =>
                Effect.async((resume) => {
                    starts++
                    const timer = setTimeout(
                        () =>
                            resume(
                                Effect.succeed({
                                    v: 1,
                                    id: String(starts),
                                    ok: true,
                                    captureHigh: '0',
                                    captureLow: '1',
                                    state: 'running',
                                    registryRevision: '1',
                                    startedAtNs: '1',
                                    stoppedAtNs: null,
                                    failure: null,
                                }),
                            ),
                        10,
                    )
                    return Effect.sync(() => clearTimeout(timer))
                }),
        })
        const exits = await Effect.runPromise(
            Effect.gen(function* () {
                const capture = yield* Capture
                return yield* Effect.all(
                    [
                        capture.startReplay('first').pipe(Effect.exit),
                        capture.startReplay('second').pipe(Effect.exit),
                    ],
                    { concurrency: 'unbounded' },
                )
            }).pipe(
                Effect.provide(Capture.layer),
                Effect.provide(Layer.succeed(ReplayWorker, worker)),
            ),
        )
        expect(starts).toBe(1)
        expect(exits.filter((exit) => exit._tag === 'Success')).toHaveLength(1)
        const failure = exits.find((exit) => exit._tag === 'Failure')
        expect(failure && Cause.pretty(failure.cause)).toContain('CaptureAlreadyRunning')
    })
})

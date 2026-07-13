import { Cause, Effect, Layer } from 'effect'
import { describe, expect, test } from 'vitest'
import { LiveCaptureInterface, LiveCaptureSource } from '@repo/shared/capture'

import { ReplayWorker } from './replay-worker'
import { Capture } from './service'

const provideCapture = <A, E>(effect: Effect.Effect<A, E, Capture>, response: unknown) =>
    Effect.runPromise(
        effect.pipe(
            Effect.provide(Capture.layer),
            Effect.provide(
                Layer.succeed(
                    ReplayWorker,
                    ReplayWorker.of({
                        request: (command) =>
                            Effect.succeed(command.op === 'hello' ? helloResponse : response),
                    }),
                ),
            ),
        ),
    )

const helloResponse = {
    v: 2,
    id: 'hello',
    ok: true,
    protocolVersion: 2,
    features: ['live', 'replay', 'packetDetail', 'framedControl', 'detailFile'],
} as const

describe('Capture', () => {
    test('preserves portable interface addresses from the native worker', async () => {
        const interfaces = await provideCapture(
            Effect.gen(function* () {
                return yield* (yield* Capture).listInterfaces()
            }),
            {
                v: 2,
                id: '1',
                ok: true,
                interfaces: [
                    {
                        name: 'en0',
                        description: 'Wi-Fi',
                        addresses: [
                            { family: 'IPv4', address: '192.0.2.10' },
                            { family: 'IPv6', address: '2001:db8::10' },
                        ],
                        isLoopback: false,
                        isUp: true,
                        isRunning: true,
                        isWireless: true,
                    },
                ],
            },
        )

        expect(interfaces[0]?.addresses).toEqual([
            { family: 'IPv4', address: '192.0.2.10' },
            { family: 'IPv6', address: '2001:db8::10' },
        ])
    })

    test('converts capture halves to canonical hex and preserves u64 decimal strings', async () => {
        const session = await provideCapture(
            Effect.gen(function* () {
                return yield* (yield* Capture).startReplay('fixture')
            }),
            {
                v: 2,
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
                if (value.op === 'hello') return Effect.succeed(helloResponse)
                command = value
                if (value.op === 'start') {
                    return Effect.succeed({
                        v: 2,
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
                    v: 2,
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
                    command.op === 'hello'
                        ? helloResponse
                        : command.op === 'start'
                          ? {
                                v: 2,
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
                                v: 2,
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
            request: (command) =>
                command.op === 'hello'
                    ? Effect.succeed(helloResponse)
                    : Effect.async((resume) => {
                          starts++
                          const timer = setTimeout(
                              () =>
                                  resume(
                                      Effect.succeed({
                                          v: 2,
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

    test('serializes bounded live options for the native worker', async () => {
        let sent: Readonly<Record<string, unknown>> | undefined
        const worker = ReplayWorker.of({
            request: (command) => {
                if (command.op === 'hello') return Effect.succeed(helloResponse)
                sent = command
                return Effect.succeed({
                    v: 2,
                    id: '1',
                    ok: true,
                    captureHigh: '0',
                    captureLow: '9',
                    state: 'running',
                    registryRevision: '1',
                    startedAtNs: '1',
                    stoppedAtNs: null,
                    failure: null,
                })
            },
        })
        const source = new LiveCaptureSource({
            interfaces: [
                new LiveCaptureInterface({
                    name: 'en0',
                    promiscuous: true,
                    monitorMode: false,
                    linkType: null,
                    timestampType: null,
                }),
            ],
            bpfFilter: 'tcp port 443',
            snaplen: 65_535,
            pcapBufferSizeBytes: 8 * 1024 * 1024,
            readTimeoutMs: 10,
            dispatchBatchSize: 64,
            ringSlots: 1024,
            captureQueueBytes: 16 * 1024 * 1024,
            maxTotalRingBytes: 128 * 1024 * 1024,
            spoolMaxTotalBytes: String(8 * 1024 * 1024 * 1024),
            spoolSegmentBytes: String(512 * 1024 * 1024),
            spoolMaxSegments: 16,
            spoolRingMode: false,
            spoolTemporary: true,
        })

        const session = await Effect.runPromise(
            Effect.gen(function* () {
                return yield* (yield* Capture).startLive(source)
            }).pipe(
                Effect.provide(Capture.layer),
                Effect.provide(Layer.succeed(ReplayWorker, worker)),
            ),
        )

        expect(session.source).toEqual(source)
        expect(sent).toMatchObject({
            op: 'startLive',
            interfaceCount: 1,
            interface0Name: 'en0',
            interface0Promiscuous: true,
            interface0MonitorMode: false,
            interface0LinkType: 0,
            interface0TimestampType: '',
            bpfFilter: 'tcp port 443',
            snaplen: 65_535,
            ringBytes: 16 * 1024 * 1024,
            spoolMaxTotalBytes: String(8 * 1024 * 1024 * 1024),
        })
    })
})

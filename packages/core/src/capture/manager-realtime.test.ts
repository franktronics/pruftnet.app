import {
    CaptureEvent,
    CaptureEventBatch,
    CaptureRecord,
    CaptureSession,
    type CaptureStatSample,
    type CaptureStats,
    type DurableCaptureState,
    PacketKey,
    PacketSummary,
    PacketSummaryBatch,
    ReplayCaptureSource,
} from '@repo/shared/capture'
import { Effect, Layer } from 'effect'
import { describe, expect, test } from 'vitest'

import { RealtimeHub } from '#core/realtime/hub'
import { AppDataPaths } from '#core/storage'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureSessionManager } from './manager'
import { CaptureRecovery } from './recovery'
import { Capture } from './service'

describe('CaptureSessionManager', () => {
    test('serves active summary and event clients without reading native journals', async () => {
        let summaryReads = 0
        let eventReads = 0
        const captureId = 'a'.repeat(32)
        const dependencies = Layer.mergeAll(
            Layer.succeed(
                Capture,
                Capture.of({
                    summaries: () => Effect.die('native summaries must be supervisor-only'),
                    events: () => Effect.die('native events must be supervisor-only'),
                } as never),
            ),
            Layer.succeed(
                CaptureSessionRepository,
                CaptureSessionRepository.of({
                    reconcileInterrupted: () => Effect.void,
                    get: () =>
                        Effect.succeed({
                            captureId,
                            state: 'capturing',
                        } as never),
                    readSummaries: () =>
                        Effect.sync(() => {
                            summaryReads += 1
                            return [
                                new PacketSummary({
                                    cursor: '3',
                                    key: new PacketKey({ captureId, packetId: '3' }),
                                    timestampNs: '3',
                                    interfaceId: 0,
                                    capturedLength: 64,
                                    wireLength: 64,
                                    linkType: 1,
                                    captureFlags: 0,
                                    parseCondition: 'complete',
                                    protocolPath: [],
                                    columns: [],
                                    analysisRevision: '1',
                                }),
                            ]
                        }),
                    readEvents: () =>
                        Effect.sync(() => {
                            eventReads += 1
                            return [
                                new CaptureEvent({
                                    cursor: '4',
                                    timestampNs: '4',
                                    severity: 'warning',
                                    code: 'JournalGap',
                                    message: 'A durable cursor gap was detected.',
                                    recoverable: true,
                                    interfaceId: null,
                                }),
                            ]
                        }),
                } as never),
            ),
            Layer.succeed(
                CaptureRecovery,
                CaptureRecovery.of({ recoverInterrupted: () => Effect.void }),
            ),
            Layer.succeed(AppDataPaths, AppDataPaths.of({} as never)),
            RealtimeHub.layer,
        )
        const layer = CaptureSessionManager.layer.pipe(Layer.provide(dependencies))

        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const manager = yield* CaptureSessionManager
                return {
                    summaries: yield* manager.summaries(captureId, undefined, 1024),
                    events: yield* manager.events(captureId, undefined, 512),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(summaryReads).toBe(1)
        expect(eventReads).toBe(1)
        expect(result.summaries.captureComplete).toBe(false)
        expect(result.summaries.gapBeforeFirst).toBe(true)
        expect(result.events.gapBeforeFirst).toBe(true)
    })

    test('interrupts its supervisor before stopping an active capture', async () => {
        let captureId = 'b'.repeat(32)
        const source = new ReplayCaptureSource({ fileId: 'fixture' })
        const currentStats = () => ({ captureId }) as CaptureStats
        let state: DurableCaptureState = 'preparing'
        let stoppedAtNs: string | null = null
        let statsCalls = 0
        let stopCalls = 0
        let resolveSupervisorStarted!: () => void
        const supervisorStarted = new Promise<void>((resolve) => {
            resolveSupervisorStarted = resolve
        })
        const record = () =>
            new CaptureRecord({
                captureId,
                state,
                source,
                interfaceNames: [],
                sourceFormat: 'pcapng',
                registryRevision: '1',
                startedAtNs: '1',
                stoppedAtNs,
                packetCount: '0',
                retainedBytes: '0',
                retainedPortionOnly: false,
                failure: null,
            })
        const runningSession = () =>
            new CaptureSession({
                captureId,
                state: state === 'stopped' ? 'stopped' : 'running',
                source,
                registryRevision: '1',
                startedAtNs: '1',
                stoppedAtNs,
                failure: null,
            })
        const dependencies = Layer.mergeAll(
            Layer.succeed(
                Capture,
                Capture.of({
                    startReplay: () => Effect.succeed(runningSession()),
                    stop: () =>
                        Effect.sync(() => {
                            stopCalls += 1
                            state = 'stopped'
                            stoppedAtNs = '2'
                            return runningSession()
                        }),
                    stats: () => {
                        statsCalls += 1
                        if (statsCalls !== 1) return Effect.succeed(currentStats())
                        return Effect.sync(resolveSupervisorStarted).pipe(
                            Effect.zipRight(Effect.sleep('1 second')),
                            Effect.zipRight(Effect.die('supervisor should be interrupted')),
                        )
                    },
                    segments: () => Effect.succeed([]),
                    summaries: () =>
                        Effect.succeed(
                            new PacketSummaryBatch({
                                captureId,
                                firstCursor: null,
                                lastCursor: null,
                                oldestAvailableCursor: null,
                                newestAvailableCursor: null,
                                gapBeforeFirst: false,
                                captureComplete: state === 'stopped',
                                summaries: [],
                            }),
                        ),
                    events: () =>
                        Effect.succeed(
                            new CaptureEventBatch({
                                captureId,
                                gapBeforeFirst: false,
                                events: [],
                            }),
                        ),
                    session: () => Effect.succeed(runningSession()),
                } as never),
            ),
            Layer.succeed(
                CaptureSessionRepository,
                CaptureSessionRepository.of({
                    reconcileInterrupted: () => Effect.void,
                    active: () => Effect.succeed(null),
                    create: (nextCaptureId: string) =>
                        Effect.sync(() => {
                            captureId = nextCaptureId
                            return record()
                        }),
                    get: () => Effect.succeed(record()),
                    transition: (
                        _id: string,
                        nextState: DurableCaptureState,
                        updates?: { readonly stoppedAtNs?: string },
                    ) =>
                        Effect.sync(() => {
                            state = nextState
                            stoppedAtNs = updates?.stoppedAtNs ?? stoppedAtNs
                            return record()
                        }),
                    persistStats: () =>
                        Effect.succeed({
                            sampledAtNs: '1',
                            stats: currentStats(),
                        } as CaptureStatSample),
                    upsertSegments: () => Effect.void,
                    persistSummaries: () => Effect.void,
                    persistEvents: () => Effect.void,
                } as never),
            ),
            Layer.succeed(
                CaptureRecovery,
                CaptureRecovery.of({ recoverInterrupted: () => Effect.void }),
            ),
            Layer.succeed(
                AppDataPaths,
                AppDataPaths.of({
                    captureSegmentsRoot: () => '/tmp',
                } as never),
            ),
            Layer.succeed(
                RealtimeHub,
                RealtimeHub.of({
                    publishCaptureRecord: () => Effect.void,
                    publishCaptureSnapshot: () => Effect.void,
                    publishCaptureDataAvailable: () => Effect.void,
                } as never),
            ),
        )
        const layer = CaptureSessionManager.layer.pipe(Layer.provide(dependencies))

        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const manager = yield* CaptureSessionManager
                yield* manager.start(source)
                yield* Effect.promise(() => supervisorStarted)
                const startedAt = Date.now()
                const session = yield* manager.stop(captureId)
                return { session, elapsedMs: Date.now() - startedAt }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.session.state).toBe('stopped')
        expect(result.elapsedMs).toBeLessThan(500)
        expect(stopCalls).toBe(1)
    })
})

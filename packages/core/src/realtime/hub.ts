import { randomBytes } from 'node:crypto'

import type {
    CaptureRecord,
    CaptureSession,
    CaptureStatSample,
    CaptureStats,
    ExportJob,
} from '@repo/shared/capture'
import {
    ApplicationHeartbeat,
    ApplicationStreamReady,
    CaptureDataAvailable,
    CaptureHeartbeat,
    CaptureLiveSnapshot,
    CaptureRecordChanged,
    CaptureRecordDeleted,
    CaptureStreamReady,
    ExportJobChanged,
    ServerShuttingDown,
    type ApplicationChange,
    type CaptureChange,
} from '@repo/shared/realtime'
import { Context, Effect, Layer, PubSub, Stream } from 'effect'

export interface CaptureSnapshotInput {
    readonly captureId: string
    readonly session: CaptureSession
    readonly stats: CaptureStats | null
    readonly statSample: CaptureStatSample | null
    readonly summaryCursor: string | null
    readonly eventCursor: string | null
    readonly terminal: boolean
}

export interface CaptureDataAvailableInput {
    readonly captureId: string
    readonly summaryCursor: string | null
    readonly eventCursor: string | null
}

export interface RealtimeHubService {
    readonly instanceId: string
    readonly applicationChanges: Stream.Stream<ApplicationChange>
    readonly captureChanges: (captureId: string) => Stream.Stream<CaptureChange>
    readonly publishCaptureRecord: (capture: CaptureRecord) => Effect.Effect<void>
    readonly publishCaptureDeleted: (captureId: string) => Effect.Effect<void>
    readonly publishExportJob: (job: ExportJob) => Effect.Effect<void>
    readonly publishCaptureSnapshot: (input: CaptureSnapshotInput) => Effect.Effect<void>
    readonly publishCaptureDataAvailable: (input: CaptureDataAvailableInput) => Effect.Effect<void>
    readonly close: Effect.Effect<void>
}

export class RealtimeHub extends Context.Tag('@repo/core/realtime/RealtimeHub')<
    RealtimeHub,
    RealtimeHubService
>() {
    static readonly layer = Layer.scoped(
        RealtimeHub,
        Effect.gen(function* () {
            const instanceId = randomBytes(16).toString('hex')
            const applicationPubSub = yield* PubSub.sliding<ApplicationChange>(256)
            const capturePubSub = yield* PubSub.sliding<CaptureChange>(32)
            const applicationMutex = yield* Effect.makeSemaphore(1)
            const captureMutex = yield* Effect.makeSemaphore(1)
            let applicationSequence = 0n
            const captureSequences = new Map<string, bigint>()
            let closed = false

            const publishApplication = (
                makeEvent: (sequence: string) => ApplicationChange,
            ): Effect.Effect<void> =>
                applicationMutex.withPermits(1)(
                    Effect.gen(function* () {
                        if (closed) return
                        applicationSequence += 1n
                        yield* PubSub.publish(
                            applicationPubSub,
                            makeEvent(applicationSequence.toString()),
                        )
                    }),
                )

            const publishCapture = (
                captureId: string,
                makeEvent: (sequence: string) => CaptureChange,
            ): Effect.Effect<void> =>
                captureMutex.withPermits(1)(
                    Effect.gen(function* () {
                        if (closed) return
                        const sequence = (captureSequences.get(captureId) ?? 0n) + 1n
                        captureSequences.set(captureId, sequence)
                        yield* PubSub.publish(capturePubSub, makeEvent(sequence.toString()))
                    }),
                )

            const applicationHeartbeat = Stream.repeatEffect(
                Effect.sleep('20 seconds').pipe(
                    Effect.zipRight(
                        Effect.sync(
                            () =>
                                new ApplicationHeartbeat({
                                    instanceId,
                                    sequence: applicationSequence.toString(),
                                }),
                        ),
                    ),
                ),
            )

            const applicationChanges = Stream.unwrapScoped(
                Effect.gen(function* () {
                    const subscription = yield* PubSub.subscribe(applicationPubSub)
                    const ready = new ApplicationStreamReady({
                        instanceId,
                        sequence: applicationSequence.toString(),
                    })
                    return Stream.succeed<ApplicationChange>(ready).pipe(
                        Stream.concat(
                            Stream.fromQueue(subscription).pipe(
                                Stream.merge(applicationHeartbeat, {
                                    haltStrategy: 'left',
                                }),
                            ),
                        ),
                    )
                }),
            )

            const captureChanges = (captureId: string) =>
                Stream.unwrapScoped(
                    Effect.gen(function* () {
                        const subscription = yield* PubSub.subscribe(capturePubSub)
                        const ready = new CaptureStreamReady({
                            instanceId,
                            captureId,
                            sequence: (captureSequences.get(captureId) ?? 0n).toString(),
                        })
                        const changes = Stream.fromQueue(subscription).pipe(
                            Stream.filter(
                                (change) =>
                                    !('captureId' in change) || change.captureId === captureId,
                            ),
                        )
                        const heartbeat = Stream.repeatEffect(
                            Effect.sleep('20 seconds').pipe(
                                Effect.zipRight(
                                    Effect.sync(
                                        () =>
                                            new CaptureHeartbeat({
                                                instanceId,
                                                captureId,
                                                sequence: (
                                                    captureSequences.get(captureId) ?? 0n
                                                ).toString(),
                                            }),
                                    ),
                                ),
                            ),
                        )
                        return Stream.succeed<CaptureChange>(ready).pipe(
                            Stream.concat(
                                changes.pipe(Stream.merge(heartbeat, { haltStrategy: 'left' })),
                            ),
                        )
                    }),
                )

            const close = applicationMutex.withPermits(1)(
                Effect.gen(function* () {
                    if (closed) return
                    applicationSequence += 1n
                    yield* PubSub.publish(
                        applicationPubSub,
                        new ServerShuttingDown({
                            sequence: applicationSequence.toString(),
                        }),
                    )
                    yield* Effect.yieldNow()
                    closed = true
                    yield* PubSub.shutdown(applicationPubSub)
                    yield* PubSub.shutdown(capturePubSub)
                }),
            )

            yield* Effect.addFinalizer(() => close)

            return RealtimeHub.of({
                instanceId,
                applicationChanges,
                captureChanges,
                publishCaptureRecord: (capture) =>
                    publishApplication(
                        (sequence) => new CaptureRecordChanged({ sequence, capture }),
                    ),
                publishCaptureDeleted: (captureId) =>
                    publishApplication(
                        (sequence) => new CaptureRecordDeleted({ sequence, captureId }),
                    ),
                publishExportJob: (job) =>
                    publishApplication((sequence) => new ExportJobChanged({ sequence, job })),
                publishCaptureSnapshot: (input) =>
                    publishCapture(
                        input.captureId,
                        (sequence) => new CaptureLiveSnapshot({ sequence, ...input }),
                    ),
                publishCaptureDataAvailable: (input) =>
                    publishCapture(
                        input.captureId,
                        (sequence) => new CaptureDataAvailable({ sequence, ...input }),
                    ),
                close,
            })
        }),
    )
}

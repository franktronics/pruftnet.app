import { Deferred, Effect, Fiber, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import { RealtimeHub } from './hub'

describe('RealtimeHub', () => {
    test('subscribes before the ready event and closes active streams', async () => {
        const captureId = 'a'.repeat(32)
        const tags = await Effect.runPromise(
            Effect.gen(function* () {
                const realtime = yield* RealtimeHub
                const ready = yield* Deferred.make<void>()
                const deleted = yield* Deferred.make<void>()
                const tags: string[] = []
                const fiber = yield* realtime.applicationChanges.pipe(
                    Stream.runForEach((change) =>
                        Effect.sync(() => {
                            tags.push(change._tag)
                        }).pipe(
                            Effect.zipRight(
                                change._tag === 'ApplicationStreamReady'
                                    ? Deferred.succeed(ready, undefined)
                                    : change._tag === 'CaptureRecordDeleted'
                                      ? Deferred.succeed(deleted, undefined)
                                      : Effect.void,
                            ),
                        ),
                    ),
                    Effect.forkScoped,
                )
                yield* Deferred.await(ready)
                yield* realtime.publishCaptureDeleted(captureId)
                yield* Deferred.await(deleted)
                yield* realtime.close
                yield* Fiber.await(fiber)
                return tags
            }).pipe(Effect.provide(RealtimeHub.layer), Effect.scoped),
        )

        expect(tags.slice(0, 2)).toEqual(['ApplicationStreamReady', 'CaptureRecordDeleted'])
    })

    test('isolates capture-scoped changes', async () => {
        const selectedCaptureId = 'b'.repeat(32)
        const otherCaptureId = 'c'.repeat(32)
        const tags = await Effect.runPromise(
            Effect.gen(function* () {
                const realtime = yield* RealtimeHub
                const ready = yield* Deferred.make<void>()
                const values = yield* realtime.captureChanges(selectedCaptureId).pipe(
                    Stream.tap((change) =>
                        change._tag === 'CaptureStreamReady'
                            ? Deferred.succeed(ready, undefined)
                            : Effect.void,
                    ),
                    Stream.take(2),
                    Stream.runCollect,
                    Effect.forkScoped,
                )
                yield* Deferred.await(ready)
                yield* realtime.publishCaptureDataAvailable({
                    captureId: otherCaptureId,
                    summaryCursor: '1',
                    eventCursor: null,
                })
                yield* realtime.publishCaptureDataAvailable({
                    captureId: selectedCaptureId,
                    summaryCursor: '2',
                    eventCursor: null,
                })
                return Array.from(yield* Fiber.join(values), (change) => change._tag)
            }).pipe(Effect.provide(RealtimeHub.layer), Effect.scoped),
        )

        expect(tags).toEqual(['CaptureStreamReady', 'CaptureDataAvailable'])
    })
})

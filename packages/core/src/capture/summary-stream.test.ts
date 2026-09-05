import {
    PacketKey,
    PacketSummaryBatch,
    PacketSummaryManifest,
    PacketSummary,
} from '@repo/shared/capture'
import { Effect, Layer, Stream } from 'effect'
import { expect, test } from 'vitest'
import { RealtimeHub } from '#core/realtime/hub'
import { AppDataPaths } from '#core/storage'
import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureSessionManager } from './manager'
import { CaptureRecovery } from './recovery'
import { Capture } from './service'

const captureId = 'a'.repeat(32)
function fixture(count: number) {
    const ranges: number[] = []
    const rows = (start: number, limit: number) =>
        Array.from(
            { length: Math.min(limit, count - start) },
            (_, offset) =>
                new PacketSummary({
                    cursor: String(start + offset + 1),
                    key: new PacketKey({ captureId, packetId: String(start + offset + 1) }),
                    timestampNs: String(start + offset + 100),
                    interfaceId: 0,
                    capturedLength: 64,
                    wireLength: 64,
                    linkType: 1,
                    captureFlags: 0,
                    parseCondition: 'complete',
                    analysisRevision: '1',
                    columns: [],
                    protocolPath: [],
                }),
        )
    const dependencies = Layer.mergeAll(
        Layer.succeed(
            Capture,
            Capture.of({ summaries: () => Effect.die('native journal must not be read') } as never),
        ),
        Layer.succeed(
            CaptureSessionRepository,
            CaptureSessionRepository.of({
                reconcileInterrupted: () => Effect.void,
                get: () => Effect.succeed({ captureId, state: 'capturing' } as never),
                summaryManifest: () =>
                    Effect.succeed(
                        new PacketSummaryManifest({
                            captureId,
                            revision: String(count),
                            rowCount: count,
                            totalRowCount: count,
                            originTimestampNs: '100',
                            lastTimestampNs: String(count + 99),
                            hasGaps: false,
                            captureComplete: false,
                        }),
                    ),
                readSummaryRange: (
                    _id: string,
                    _revision: string,
                    _filter: unknown,
                    start: number,
                    limit: number,
                ) =>
                    Effect.sync(() => {
                        ranges.push(start)
                        return rows(start, limit)
                    }),
                readSummaries: (_id: string, cursor: string | undefined, limit: number) =>
                    Effect.succeed(rows(Number(cursor ?? 0), limit)),
            } as never),
        ),
        Layer.succeed(
            CaptureRecovery,
            CaptureRecovery.of({ recoverInterrupted: () => Effect.void }),
        ),
        Layer.succeed(AppDataPaths, AppDataPaths.of({} as never)),
        RealtimeHub.layer,
    )
    return { ranges, layer: CaptureSessionManager.layer.pipe(Layer.provide(dependencies)) }
}

test('opens an active capture at its recent tail with the original time origin', async () => {
    const { ranges, layer } = fixture(10_000)
    const result = await Effect.runPromise(
        Effect.gen(function* () {
            const manager = yield* CaptureSessionManager
            return yield* manager.streamSummaries(captureId).pipe(Stream.take(1), Stream.runCollect)
        }).pipe(Effect.provide(layer), Effect.scoped),
    )
    const batch = Array.from(result)[0]!
    expect(ranges).toEqual([8_976])
    expect(batch.firstCursor).toBe('8977')
    expect(batch.lastCursor).toBe('10000')
    expect(batch.originTimestampNs).toBe('100')
    expect(batch.gapBeforeFirst).toBe(true)
})

test('bounds one response and resumes exactly after the last consumed cursor', async () => {
    const { layer } = fixture(20_000)
    const result = await Effect.runPromise(
        Effect.gen(function* () {
            const manager = yield* CaptureSessionManager
            const first = yield* manager.streamSummaries(captureId, '0').pipe(Stream.runCollect)
            const batches: PacketSummaryBatch[] = Array.from(first)
            const next = yield* manager
                .streamSummaries(captureId, batches.at(-1)!.lastCursor!)
                .pipe(Stream.take(1), Stream.runCollect)
            return { batches, next: Array.from(next)[0]! }
        }).pipe(Effect.provide(layer), Effect.scoped),
    )
    expect(result.batches).toHaveLength(8)
    expect(result.batches[0]!.firstCursor).toBe('1')
    expect(result.batches.at(-1)!.lastCursor).toBe('8192')
    expect(result.next.firstCursor).toBe('8193')
})

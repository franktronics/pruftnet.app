import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CreateExportRequest, ServerExportDestination } from '@repo/shared/capture'
import { Deferred, Effect, Layer } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { CaptureCatalog } from './catalog'
import { CaptureSessionRepository } from './capture-session-repository'
import { ExportDestination } from './export-destination'
import { ExportEncoder } from './export-encoder'
import { ExportArtifactRepository, type CachedExportArtifact } from './export-repository'
import { ExportScheduler, type ExportSchedulerService } from './export-scheduler'
import { CaptureSessionManager } from './manager'
import { Capture } from './service'
import { RealtimeHub } from '#core/realtime/hub'

const roots: Array<string> = []

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const waitForJob = Effect.fn('test.waitForExportJob')(function* (
    scheduler: ExportSchedulerService,
    exportId: string,
    state: 'completed' | 'failed',
) {
    while (true) {
        const job = (yield* scheduler.list()).exports.find(
            (candidate) => candidate.exportId === exportId,
        )
        if (job?.state === state) return job
        yield* Effect.sleep('5 millis')
    }
})

describe('ExportScheduler', () => {
    test('reuses an unchanged artifact and replaces it when the snapshot advances', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pruftnet-export-cache-'))
        roots.push(root)
        const captureId = 'a'.repeat(32)
        const sourcePath = join(root, 'capture.pcapng')
        const artifactPath = join(root, 'artifact.pcapng')
        const partialPath = `${artifactPath}.partial`
        const encodedBytes = Buffer.from('prepared-export')
        await writeFile(sourcePath, Buffer.alloc(64))
        let cached: CachedExportArtifact | undefined
        let encodeCount = 0
        let deliveryCount = 0
        const deferredFinalizations: number[] = []
        let committedBytes = '64'
        const encodingStarted = await Effect.runPromise(Deferred.make<void>())
        const continueEncoding = await Effect.runPromise(Deferred.make<void>())

        const dependencies = Layer.mergeAll(
            Layer.succeed(
                CaptureCatalog,
                CaptureCatalog.of({
                    get: () =>
                        Effect.succeed({
                            captureId,
                            state: 'stopped',
                            interfaceNames: ['en0'],
                            startedAtNs: '1',
                            retainedBytes: '64',
                        } as never),
                    finalizeDeferred: () =>
                        Effect.sync(() => {
                            deferredFinalizations.push(deliveryCount)
                            return {
                                captureId,
                                state: 'stopped',
                            } as never
                        }),
                } as never),
            ),
            Layer.succeed(
                CaptureSessionRepository,
                CaptureSessionRepository.of({
                    acquireExportSnapshot: () =>
                        Effect.succeed({
                            segments: [
                                {
                                    generation: 1n as never,
                                    path: sourcePath,
                                    committedBytes,
                                    committedPackets: '1',
                                },
                            ],
                            retainedPortionOnly: false,
                        }),
                    releaseExportSnapshot: () => Effect.void,
                    upsertSegments: () => Effect.void,
                } as never),
            ),
            Layer.succeed(
                ExportArtifactRepository,
                ExportArtifactRepository.of({
                    get: () => Effect.succeed(cached),
                    put: (artifact) =>
                        Effect.sync(() => {
                            cached = artifact
                            return artifact
                        }),
                    remove: () => Effect.void,
                }),
            ),
            Layer.succeed(
                ExportDestination,
                ExportDestination.of({
                    cachePaths: () => Effect.succeed({ artifactPath, partialPath }),
                    resolve: () => Effect.succeed({ kind: 'server' }),
                    deliver: () =>
                        Effect.sync(() => {
                            deliveryCount += 1
                            return 'server' as const
                        }),
                }),
            ),
            Layer.succeed(
                ExportEncoder,
                ExportEncoder.of({
                    encode: (input) =>
                        Effect.gen(function* () {
                            encodeCount += 1
                            yield* Deferred.succeed(encodingStarted, undefined)
                            yield* Deferred.await(continueEncoding)
                            yield* Effect.promise(() => writeFile(input.partialPath, encodedBytes))
                            return {
                                packetsWritten: '1',
                                bytesWritten: String(encodedBytes.length),
                                checksumSha256: createHash('sha256')
                                    .update(encodedBytes)
                                    .digest('hex'),
                                finalSize: String(encodedBytes.length),
                            }
                        }),
                }),
            ),
            Layer.succeed(Capture, Capture.of({} as never)),
            Layer.succeed(CaptureSessionManager, CaptureSessionManager.of({} as never)),
            RealtimeHub.layer,
        )
        const layer = ExportScheduler.layer.pipe(Layer.provide(dependencies))
        const request = new CreateExportRequest({
            captureId,
            format: 'pcapng',
            destination: new ServerExportDestination(),
            destinationLabel: 'Server PCAPNG download',
        })
        const concurrentRequest = new CreateExportRequest({
            ...request,
            destinationLabel: 'Second server PCAPNG download',
        })

        const results = await Effect.runPromise(
            Effect.gen(function* () {
                const scheduler = yield* ExportScheduler
                const first = yield* scheduler.create(request)
                yield* Deferred.await(encodingStarted)
                const concurrent = yield* scheduler.create(concurrentRequest)
                const activeJobs = (yield* scheduler.list()).exports.filter(
                    (job) => job.state === 'running',
                )
                yield* Deferred.succeed(continueEncoding, undefined)
                const firstCompleted = yield* waitForJob(scheduler, first.exportId, 'completed')
                const concurrentCompleted = yield* waitForJob(
                    scheduler,
                    concurrent.exportId,
                    'completed',
                )
                const repeated = yield* scheduler.create(request)
                const repeatedCompleted = yield* waitForJob(
                    scheduler,
                    repeated.exportId,
                    'completed',
                )
                committedBytes = '65'
                const advanced = yield* scheduler.create(request)
                const advancedCompleted = yield* waitForJob(
                    scheduler,
                    advanced.exportId,
                    'completed',
                )
                const finalJobs = yield* scheduler.list()
                return {
                    firstCompleted,
                    concurrentCompleted,
                    repeatedCompleted,
                    advancedCompleted,
                    activeJobs,
                    finalJobs,
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(encodeCount).toBe(2)
        expect(deliveryCount).toBe(4)
        expect(deferredFinalizations).toEqual([2, 3, 4])
        expect(results.activeJobs).toHaveLength(2)
        expect(results.activeJobs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    captureId,
                    phase: 'encoding',
                    packetsTotal: '1',
                }),
                expect.objectContaining({
                    captureId,
                    phase: 'encoding',
                    packetsTotal: '1',
                }),
            ]),
        )
        expect(results.firstCompleted.downloadPath).toBe(`/exports/${captureId}/pcapng/download`)
        expect(results.concurrentCompleted.downloadPath).toBe(results.firstCompleted.downloadPath)
        expect(results.repeatedCompleted.downloadPath).toBe(results.firstCompleted.downloadPath)
        expect(results.advancedCompleted.downloadPath).toBe(results.firstCompleted.downloadPath)
        expect(results.finalJobs.exports).toHaveLength(4)
        expect(results.finalJobs.exports.every((job) => job.state === 'completed')).toBe(true)
    })
})

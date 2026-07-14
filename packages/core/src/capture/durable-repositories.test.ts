import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { ReplayCaptureSource } from '@repo/shared/capture'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { AppDataPaths, Database, InstanceLock } from '#core/storage'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureCatalog } from './catalog'
import { ExportJobRepository } from './export-repository'

const roots: Array<string> = []
const migrationsFolder = resolve(process.cwd(), 'drizzle')
const source = new ReplayCaptureSource({ fileId: 'fixture' })

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function durableLayer() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'pruftnet-durable-repositories-')))
    roots.push(root)
    const paths = AppDataPaths.layer({ runtime: 'test', environment: 'test', dataRoot: root })
    const lock = InstanceLock.layer.pipe(Layer.provideMerge(paths))
    const database = Database.layerWith({ migrationsFolder }).pipe(Layer.provideMerge(lock))
    const captures = CaptureSessionRepository.layer.pipe(Layer.provideMerge(database))
    const exports = ExportJobRepository.layer.pipe(Layer.provideMerge(database))
    const catalog = CaptureCatalog.layer.pipe(Layer.provideMerge(captures))
    return Layer.mergeAll(paths, captures, exports, catalog)
}

const stopCapture = Effect.fn('test.stopCapture')(function* (captureId: string) {
    const captures = yield* CaptureSessionRepository
    yield* captures.create(captureId, source)
    yield* captures.transition(captureId, 'capturing', { registryRevision: '1' })
    yield* captures.transition(captureId, 'stopping')
    yield* captures.transition(captureId, 'stopped', { stoppedAtNs: '4' })
})

describe('durable repositories', () => {
    test('keeps an immutable idempotent snapshot leased until deferred deletion completes', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                const captures = yield* CaptureSessionRepository
                const exports = yield* ExportJobRepository
                const catalog = yield* CaptureCatalog
                const captureId = 'a'.repeat(32)
                const exportId = 'b'.repeat(32)
                yield* stopCapture(captureId)
                const segmentRoot = paths.captureSegmentsRoot(captureId)
                const segmentPath = join(segmentRoot, 'capture-1.pcapng')
                yield* Effect.promise(() => mkdir(segmentRoot, { recursive: true }))
                yield* Effect.promise(() => writeFile(segmentPath, Buffer.alloc(128)))
                yield* captures.upsertSegments(captureId, [
                    {
                        generation: 1,
                        path: segmentPath,
                        committedBytes: '128',
                        committedPackets: '2',
                        firstPacketId: '1',
                        lastPacketId: '2',
                        evicted: false,
                    },
                ])
                const exportRoot = paths.exportRoot(exportId)
                yield* Effect.promise(() => mkdir(exportRoot, { recursive: true }))
                const input = {
                    exportId,
                    captureId,
                    idempotencyKey: 'stable-request',
                    format: 'pcapng' as const,
                    destinationKind: 'server' as const,
                    artifactPath: join(exportRoot, 'artifact.pcapng'),
                    partialPath: join(exportRoot, 'artifact.partial'),
                }
                const created = yield* exports.create(input)
                const repeated = yield* exports.create({ ...input, exportId: 'c'.repeat(32) })
                yield* captures.upsertSegments(captureId, [
                    {
                        generation: 1,
                        path: segmentPath,
                        committedBytes: '999',
                        committedPackets: '9',
                        firstPacketId: '1',
                        lastPacketId: '9',
                        evicted: false,
                    },
                ])
                const snapshot = yield* exports.source(exportId)
                const deferred = yield* catalog.delete(captureId)
                const existsWhileLeased = existsSync(paths.captureRoot(captureId))
                yield* exports.update(exportId, 'completed', {
                    checksumSha256: '0'.repeat(64),
                    finalSize: '64',
                    completedAtNs: '5',
                })
                yield* exports.releaseLeases(exportId)
                yield* exports.releaseLeases(exportId)
                const ready = yield* captures.deletionReady(captureId)
                const deleted = yield* catalog.finalizeDeferred(captureId)
                return {
                    created,
                    repeated,
                    snapshot,
                    deferred,
                    existsWhileLeased,
                    ready,
                    deleted,
                    existsAfterDelete: existsSync(paths.captureRoot(captureId)),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.repeated.exportId).toBe(result.created.exportId)
        expect(result.snapshot).toEqual([
            expect.objectContaining({ committedBytes: '128', committedPackets: '2' }),
        ])
        expect(result.deferred.state).toBe('deleting')
        expect(result.existsWhileLeased).toBe(true)
        expect(result.ready).toBe(true)
        expect(result.deleted.state).toBe('deleted')
        expect(result.existsAfterDelete).toBe(false)
    })

    test('persists interrupted capture and server export states for restart recovery', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                const captures = yield* CaptureSessionRepository
                const exports = yield* ExportJobRepository
                const captureId = 'd'.repeat(32)
                const exportId = 'e'.repeat(32)
                yield* captures.create(captureId, source)
                yield* captures.transition(captureId, 'capturing')
                const segmentRoot = paths.captureSegmentsRoot(captureId)
                const segmentPath = join(segmentRoot, 'capture-1.pcapng')
                yield* Effect.promise(() => mkdir(segmentRoot, { recursive: true }))
                yield* Effect.promise(() => writeFile(segmentPath, Buffer.alloc(64)))
                yield* captures.upsertSegments(captureId, [
                    {
                        generation: 1,
                        path: segmentPath,
                        committedBytes: '64',
                        committedPackets: '1',
                        firstPacketId: '1',
                        lastPacketId: '1',
                        evicted: false,
                    },
                ])
                const exportRoot = paths.exportRoot(exportId)
                yield* Effect.promise(() => mkdir(exportRoot, { recursive: true }))
                yield* exports.create({
                    exportId,
                    captureId,
                    idempotencyKey: 'interrupted-request',
                    format: 'pcapng',
                    destinationKind: 'server',
                    artifactPath: join(exportRoot, 'artifact.pcapng'),
                    partialPath: join(exportRoot, 'artifact.partial'),
                })
                yield* captures.reconcileInterrupted()
                return {
                    capture: yield* captures.get(captureId),
                    export: yield* exports.get(exportId),
                    resumable: yield* exports.interruptedServerJobs(),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.capture.state).toBe('interrupted')
        expect(result.capture.failure?.code).toBe('BackendInterrupted')
        expect(result.export.state).toBe('interrupted')
        expect(result.export.failure?.code).toBe('BackendInterrupted')
        expect(result.resumable.exports.map((job) => job.exportId)).toContain(
            result.export.exportId,
        )
    })
})

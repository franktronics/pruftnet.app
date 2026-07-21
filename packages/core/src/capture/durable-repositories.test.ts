import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
    PacketKey,
    PacketSummary,
    PacketSummaryColumn,
    PacketSummaryFilter,
    ReplayCaptureSource,
} from '@repo/shared/capture'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { AppDataPaths, Database, InstanceLock } from '#core/storage'
import { RealtimeHub } from '#core/realtime/hub'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureCatalog } from './catalog'
import { ExportArtifactRepository } from './export-repository'

const roots: Array<string> = []
const migrationsFolder = resolve(process.cwd(), 'drizzle')
const source = new ReplayCaptureSource({ fileId: 'fixture' })

function summary(
    captureId: string,
    cursor: string,
    options: { readonly protocolId?: number; readonly info?: string } = {},
) {
    const protocolId = options.protocolId ?? 1
    return new PacketSummary({
        cursor,
        key: new PacketKey({ captureId, packetId: cursor }),
        timestampNs: `${cursor}000`,
        interfaceId: 0,
        capturedLength: 64,
        wireLength: 64,
        linkType: 1,
        captureFlags: 0,
        parseCondition: 'complete',
        protocolPath: [protocolId],
        columns: [
            new PacketSummaryColumn({ key: 'source', value: '10.0.0.1' }),
            new PacketSummaryColumn({ key: 'destination', value: '10.0.0.2' }),
            new PacketSummaryColumn({
                key: 'protocol',
                value: protocolId === 2 ? 'DNS' : 'TCP',
            }),
            new PacketSummaryColumn({ key: 'length', value: '64' }),
            new PacketSummaryColumn({ key: 'info', value: options.info ?? 'packet' }),
        ],
        analysisRevision: '1',
    })
}

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
    const artifacts = ExportArtifactRepository.layer.pipe(Layer.provideMerge(database))
    const realtime = RealtimeHub.layer
    const catalog = CaptureCatalog.layer.pipe(Layer.provideMerge(Layer.merge(captures, realtime)))
    return Layer.mergeAll(paths, captures, artifacts, catalog, realtime)
}

const stopCapture = Effect.fn('test.stopCapture')(function* (captureId: string) {
    const captures = yield* CaptureSessionRepository
    yield* captures.create(captureId, source)
    yield* captures.transition(captureId, 'capturing', { registryRevision: '1' })
    yield* captures.transition(captureId, 'stopping')
    yield* captures.transition(captureId, 'stopped', { stoppedAtNs: '4' })
})

const addSegment = Effect.fn('test.addSegment')(function* (captureId: string, size = 128) {
    const paths = yield* AppDataPaths
    const captures = yield* CaptureSessionRepository
    const segmentRoot = paths.captureSegmentsRoot(captureId)
    const segmentPath = join(segmentRoot, 'capture-1.pcapng')
    yield* Effect.promise(() => mkdir(segmentRoot, { recursive: true }))
    yield* Effect.promise(() => writeFile(segmentPath, Buffer.alloc(size)))
    yield* captures.upsertSegments(captureId, [
        {
            generation: 1,
            path: segmentPath,
            committedBytes: String(size),
            committedPackets: '2',
            firstPacketId: '1',
            lastPacketId: '2',
            evicted: false,
        },
    ])
})

describe('durable repositories', () => {
    test('reads dense random-access summary ranges without replaying earlier pages', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const captures = yield* CaptureSessionRepository
                const captureId = 'd'.repeat(32)
                yield* captures.create(captureId, source)
                yield* captures.transition(captureId, 'capturing')
                yield* captures.persistSummaries(captureId, [
                    summary(captureId, '1'),
                    summary(captureId, '2', { protocolId: 2, info: 'DNS query' }),
                    summary(captureId, '4'),
                ])
                yield* captures.persistSummaries(captureId, [
                    summary(captureId, '2', { protocolId: 2, info: 'DNS query' }),
                    summary(captureId, '4'),
                    summary(captureId, '5', { protocolId: 2, info: 'DNS response' }),
                ])
                yield* captures.transition(captureId, 'stopping')
                yield* captures.transition(captureId, 'stopped', { stoppedAtNs: '6' })
                const filter = new PacketSummaryFilter({
                    search: 'dns',
                    minRelativeTimestampNs: null,
                    maxRelativeTimestampNs: null,
                    protocolIds: [2],
                    interfaceIds: [],
                    minWireLength: null,
                    maxWireLength: null,
                    parseConditions: ['complete'],
                    source: '',
                    destination: '',
                })
                return {
                    manifest: yield* captures.summaryManifest(captureId, null),
                    deepRange: yield* captures.readSummaryRange(captureId, '5', null, 2, 2),
                    filteredManifest: yield* captures.summaryManifest(captureId, filter),
                    filteredRange: yield* captures.readSummaryRange(captureId, '5', filter, 1, 1),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.manifest).toMatchObject({
            revision: '5',
            rowCount: 4,
            totalRowCount: 4,
            originTimestampNs: '1000',
            lastTimestampNs: '5000',
            hasGaps: true,
            captureComplete: true,
        })
        expect(result.deepRange.map((item) => item.cursor)).toEqual(['4', '5'])
        expect(result.filteredManifest.rowCount).toBe(2)
        expect(result.filteredRange.map((item) => item.cursor)).toEqual(['5'])
    })

    test('leases an export snapshot until deferred capture deletion completes', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                const captures = yield* CaptureSessionRepository
                const catalog = yield* CaptureCatalog
                const captureId = 'a'.repeat(32)
                yield* stopCapture(captureId)
                yield* addSegment(captureId)
                const snapshot = yield* captures.acquireExportSnapshot(captureId)
                const deferred = yield* catalog.delete(captureId)
                const existsWhileLeased = existsSync(paths.captureRoot(captureId))
                yield* captures.releaseExportSnapshot(
                    captureId,
                    snapshot.segments.map((segment) => segment.generation),
                )
                const ready = yield* captures.deletionReady(captureId)
                const deleted = yield* catalog.finalizeDeferred(captureId)
                return {
                    snapshot,
                    deferred,
                    existsWhileLeased,
                    ready,
                    deleted,
                    existsAfterDelete: existsSync(paths.captureRoot(captureId)),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.snapshot.segments).toEqual([
            expect.objectContaining({ committedBytes: '128', committedPackets: '2' }),
        ])
        expect(result.deferred.state).toBe('deleting')
        expect(result.existsWhileLeased).toBe(true)
        expect(result.ready).toBe(true)
        expect(result.deleted.state).toBe('deleted')
        expect(result.existsAfterDelete).toBe(false)
    })

    test('stores only the current cached artifact for each capture and format', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                const artifacts = yield* ExportArtifactRepository
                const captureId = 'b'.repeat(32)
                yield* stopCapture(captureId)
                const root = paths.exportRoot(captureId)
                const artifactPath = join(root, 'artifact.pcapng')
                yield* Effect.promise(() => mkdir(root, { recursive: true }))
                yield* Effect.promise(() => writeFile(artifactPath, Buffer.alloc(64)))
                yield* artifacts.put({
                    captureId,
                    format: 'pcapng',
                    sourceFingerprint: 'first',
                    artifactPath,
                    retainedPortionOnly: false,
                    checksumSha256: '1'.repeat(64),
                    finalSize: '64',
                })
                yield* artifacts.put({
                    captureId,
                    format: 'pcapng',
                    sourceFingerprint: 'second',
                    artifactPath,
                    retainedPortionOnly: false,
                    checksumSha256: '2'.repeat(64),
                    finalSize: '64',
                })
                return yield* artifacts.get(captureId, 'pcapng')
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result?.sourceFingerprint).toBe('second')
        expect(result?.checksumSha256).toBe('2'.repeat(64))
    })

    test('clears transient segment leases during restart recovery', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const captures = yield* CaptureSessionRepository
                const captureId = 'c'.repeat(32)
                yield* captures.create(captureId, source)
                yield* captures.transition(captureId, 'capturing')
                yield* addSegment(captureId, 64)
                yield* captures.acquireExportSnapshot(captureId)
                yield* captures.reconcileInterrupted()
                return {
                    capture: yield* captures.get(captureId),
                    ready: yield* captures.deletionReady(captureId),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.capture.state).toBe('interrupted')
        expect(result.capture.failure?.code).toBe('BackendInterrupted')
        expect(result.ready).toBe(true)
    })
})

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PacketSummaryFilter } from '@repo/shared/capture'
import { Effect } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { AppDataPaths } from '#core/storage'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureCatalog } from './catalog'
import { ExportArtifactRepository } from './export-repository'
import {
    addSegment,
    cleanupDurableRoots,
    durableLayer,
    source,
    stopCapture,
    summary,
} from './test-fixtures/durable-store'

afterEach(cleanupDurableRoots)

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

    test('continues live summary reads through the dense row index', async () => {
        const layer = await durableLayer()
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const captures = yield* CaptureSessionRepository
                const captureId = 'e'.repeat(32)
                yield* captures.create(captureId, source)
                yield* captures.transition(captureId, 'capturing')
                yield* captures.persistSummaries(captureId, [
                    summary(captureId, '1'),
                    summary(captureId, '2'),
                    summary(captureId, '10'),
                    summary(captureId, '11'),
                ])
                return {
                    exactCursor: yield* captures.readSummaries(captureId, '2', 2),
                    missingCursor: yield* captures.readSummaries(captureId, '3', 2),
                }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.exactCursor.map((item) => item.cursor)).toEqual(['10', '11'])
        expect(result.missingCursor.map((item) => item.cursor)).toEqual(['10', '11'])
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

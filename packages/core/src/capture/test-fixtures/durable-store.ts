import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
    PacketKey,
    PacketSummary,
    PacketSummaryColumn,
    ReplayCaptureSource,
} from '@repo/shared/capture'
import { Effect, Layer } from 'effect'

import { AppDataPaths, Database, InstanceLock } from '#core/storage'
import { RealtimeHub } from '#core/realtime/hub'

import { CaptureSessionRepository } from '#core/capture/capture-session-repository'
import { CaptureCatalog } from '#core/capture/catalog'
import { ExportArtifactRepository } from '#core/capture/export-repository'

const roots: Array<string> = []
const migrationsFolder = resolve(process.cwd(), 'drizzle')
export const source = new ReplayCaptureSource({ fileId: 'fixture' })

export function summary(
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

export async function cleanupDurableRoots() {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
}

/** A real SQLite store and data root under a temporary directory. */
export async function durableLayer() {
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

export const stopCapture = Effect.fn('test.stopCapture')(function* (captureId: string) {
    const captures = yield* CaptureSessionRepository
    yield* captures.create(captureId, source)
    yield* captures.transition(captureId, 'capturing', { registryRevision: '1' })
    yield* captures.transition(captureId, 'stopping')
    yield* captures.transition(captureId, 'stopped', { stoppedAtNs: '4' })
})

export const addSegment = Effect.fn('test.addSegment')(function* (captureId: string, size = 128) {
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

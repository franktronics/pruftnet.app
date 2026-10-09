import { lstat, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import {
    CaptureInUse,
    CaptureStorageResetResult,
    CaptureStorageUnavailable,
    CaptureStorageUsage,
    type CaptureRpcError,
    type ResetCaptureStorageRequest,
} from '@repo/shared/capture'
import { Context, Effect, Layer, Option, Schema } from 'effect'

import { AppDataPaths, Database } from '#core/storage'
import { RealtimeHub } from '#core/realtime/hub'

import { CaptureSessionRepository } from './capture-session-repository'
import { CaptureCatalog } from './catalog'
import { ExportScheduler } from './export-scheduler'
import { CaptureSessionManager } from './manager'

type MaintenanceError = Schema.Schema.Type<typeof CaptureRpcError>

// Concurrent mutations share the store; a reset takes every permit to own it exclusively.
const MUTATION_PERMITS = 1024

export interface CaptureStorageMaintenanceService {
    readonly usage: () => Effect.Effect<CaptureStorageUsage, MaintenanceError>
    readonly reset: (
        request: ResetCaptureStorageRequest,
    ) => Effect.Effect<CaptureStorageResetResult, MaintenanceError>
    /** Runs a storage mutation, failing fast while a reset owns the store. */
    readonly guardMutation: <A, E, R>(
        effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | CaptureStorageUnavailable, R>
}

function isMissing(cause: unknown) {
    return (cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

async function fileBytes(path: string) {
    try {
        return BigInt((await lstat(path)).size)
    } catch (cause) {
        if (isMissing(cause)) return 0n
        throw cause
    }
}

async function directoryBytes(root: string): Promise<bigint> {
    let entries
    try {
        entries = await readdir(root, { withFileTypes: true })
    } catch (cause) {
        if (isMissing(cause)) return 0n
        throw cause
    }
    let total = 0n
    for (const entry of entries) {
        const path = resolve(root, entry.name)
        if (entry.isDirectory()) total += await directoryBytes(path)
        else if (entry.isFile()) total += await fileBytes(path)
    }
    return total
}

async function removeUnretained(root: string, retained: ReadonlySet<string>) {
    const entries = await readdir(root).catch((cause: unknown) => {
        if (isMissing(cause)) return []
        throw cause
    })
    await Promise.all(
        entries
            .filter((name) => !retained.has(name))
            .map((name) => rm(resolve(root, name), { recursive: true, force: true })),
    )
}

function storageFailure(title: string) {
    return (cause: unknown) =>
        new CaptureStorageUnavailable({
            title,
            message: cause instanceof Error ? cause.message : String(cause),
            retryable: true,
        })
}

function totalBytes(usage: CaptureStorageUsage) {
    return BigInt(usage.databaseBytes) + BigInt(usage.captureBytes) + BigInt(usage.exportBytes)
}

export class CaptureStorageMaintenance extends Context.Tag(
    '@repo/core/capture/CaptureStorageMaintenance',
)<CaptureStorageMaintenance, CaptureStorageMaintenanceService>() {
    static readonly layer = Layer.effect(
        CaptureStorageMaintenance,
        Effect.gen(function* () {
            const paths = yield* AppDataPaths
            const database = yield* Database
            const repository = yield* CaptureSessionRepository
            const catalog = yield* CaptureCatalog
            const manager = yield* CaptureSessionManager
            const exports = yield* ExportScheduler
            const realtime = yield* RealtimeHub
            const permits = yield* Effect.makeSemaphore(MUTATION_PERMITS)
            let resetting = false

            const resetInProgress = new CaptureStorageUnavailable({
                title: 'Capture data is being deleted',
                message: 'Wait for the deletion of all capture data to finish, then try again.',
                retryable: true,
            })

            const guardMutation = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
                Effect.suspend(() =>
                    resetting
                        ? Effect.fail(resetInProgress)
                        : permits
                              .withPermitsIfAvailable(1)(effect)
                              .pipe(
                                  Effect.flatMap(
                                      Option.match({
                                          onNone: () => Effect.fail(resetInProgress),
                                          onSome: Effect.succeed,
                                      }),
                                  ),
                              ),
                )

            const usage = Effect.fn('CaptureStorageMaintenance.usage')(function* () {
                const { captures } = yield* catalog.list()
                const sizes = yield* Effect.tryPromise({
                    try: () =>
                        Promise.all([
                            Promise.all(
                                ['', '-wal', '-shm'].map((suffix) =>
                                    fileBytes(`${paths.databasePath}${suffix}`),
                                ),
                            ).then((parts) => parts.reduce((sum, part) => sum + part, 0n)),
                            directoryBytes(paths.capturesRoot),
                            directoryBytes(paths.exportsRoot),
                        ]),
                    catch: storageFailure('Storage usage is unavailable'),
                })
                const [databaseBytes, captureBytes, exportBytes] = sizes
                return new CaptureStorageUsage({
                    captureCount: captures.length.toString(),
                    databaseBytes: databaseBytes.toString(),
                    captureBytes: captureBytes.toString(),
                    exportBytes: exportBytes.toString(),
                })
            })

            const purge = Effect.fn('CaptureStorageMaintenance.purge')(function* (
                stopActiveCapture: boolean,
            ) {
                const before = yield* usage()
                const active = yield* catalog.active()
                if (active) {
                    if (!stopActiveCapture) {
                        return yield* new CaptureInUse({
                            title: 'Capture is still active',
                            message: 'Stop the capture before deleting all capture data.',
                        })
                    }
                    yield* manager.stop(active.captureId)
                }
                // Interrupting exports releases their segment leases, so deletion is not deferred.
                yield* exports.clear()
                const { captures } = yield* catalog.list()
                let deletedCaptures = 0n
                for (const capture of captures) {
                    const deleted = yield* catalog.delete(capture.captureId)
                    if (deleted.state === 'deleted') deletedCaptures += 1n
                }
                const retained = new Set(
                    yield* repository
                        .purgeDeleted()
                        .pipe(Effect.mapError(storageFailure('Capture data deletion failed'))),
                )
                yield* Effect.tryPromise({
                    try: () =>
                        Promise.all([
                            removeUnretained(paths.capturesRoot, retained),
                            removeUnretained(paths.exportsRoot, retained),
                        ]),
                    catch: storageFailure('Capture data deletion failed'),
                })
                // Data is already gone; a failed compaction only delays reclaiming disk space.
                yield* database
                    .compact()
                    .pipe(
                        Effect.catchAll((error) =>
                            Effect.logWarning(`Database compaction failed: ${error.message}`),
                        ),
                    )
                const after = yield* usage()
                const reclaimed = totalBytes(before) - totalBytes(after)
                return new CaptureStorageResetResult({
                    deletedCaptures: deletedCaptures.toString(),
                    reclaimedBytes: (reclaimed > 0n ? reclaimed : 0n).toString(),
                    usage: after,
                })
            })

            const reset = ({ stopActiveCapture }: ResetCaptureStorageRequest) =>
                Effect.suspend(() => {
                    if (resetting) return Effect.fail(resetInProgress)
                    resetting = true
                    // A cancelled request must not leave the store half deleted.
                    return Effect.uninterruptible(
                        permits.withPermits(MUTATION_PERMITS)(purge(stopActiveCapture)),
                    ).pipe(
                        // Clients reconcile even after a partial reset; every step is idempotent.
                        Effect.ensuring(
                            Effect.suspend(() => {
                                resetting = false
                                return realtime.publishStorageReset()
                            }),
                        ),
                    )
                })

            return CaptureStorageMaintenance.of({ usage, reset, guardMutation })
        }),
    )
}

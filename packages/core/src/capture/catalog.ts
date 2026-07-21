import { rm } from 'node:fs/promises'

import {
    CaptureInUse,
    CaptureNotFound,
    CaptureSession,
    CaptureStorageUnavailable,
    OpenCaptureResult,
    type CaptureRecord,
    type CaptureRecordList,
    type CaptureRpcError,
} from '@repo/shared/capture'
import { Context, Effect, Layer, Schema } from 'effect'

import { AppDataPaths } from '#core/storage'
import { RealtimeHub } from '#core/realtime/hub'

import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
} from './capture-session-repository'

type CatalogError = Schema.Schema.Type<typeof CaptureRpcError>

function catalogError(error: CaptureRepositoryError | StoredCaptureNotFound): CatalogError {
    if (error._tag === 'StoredCaptureNotFound') {
        return new CaptureNotFound({ title: 'Capture not found' })
    }
    if (error.operation === 'delete capture') {
        return new CaptureInUse({
            title: 'Capture is still active',
            message: 'Stop the capture before deleting it.',
        })
    }
    return new CaptureStorageUnavailable({
        title: 'Capture storage is unavailable',
        message: error.message,
        retryable: true,
    })
}

function sessionState(record: CaptureRecord): CaptureSession['state'] {
    switch (record.state) {
        case 'preparing':
            return 'starting'
        case 'capturing':
            return 'running'
        case 'stopping':
            return 'stopping'
        case 'failed':
            return 'failed'
        default:
            return 'stopped'
    }
}

export interface CaptureCatalogService {
    readonly list: () => Effect.Effect<CaptureRecordList, CatalogError>
    readonly get: (captureId: string) => Effect.Effect<CaptureRecord, CatalogError>
    readonly active: () => Effect.Effect<CaptureRecord | null, CatalogError>
    readonly open: (captureId: string) => Effect.Effect<OpenCaptureResult, CatalogError>
    readonly delete: (captureId: string) => Effect.Effect<CaptureRecord, CatalogError>
    readonly finalizeDeferred: (captureId: string) => Effect.Effect<CaptureRecord, CatalogError>
}

export class CaptureCatalog extends Context.Tag('@repo/core/capture/CaptureCatalog')<
    CaptureCatalog,
    CaptureCatalogService
>() {
    static readonly layer = Layer.effect(
        CaptureCatalog,
        Effect.gen(function* () {
            const repository = yield* CaptureSessionRepository
            const paths = yield* AppDataPaths
            const realtime = yield* RealtimeHub
            const mapRepository = <A>(
                effect: Effect.Effect<A, CaptureRepositoryError | StoredCaptureNotFound>,
            ) => effect.pipe(Effect.mapError(catalogError))
            const get = (captureId: string) => mapRepository(repository.get(captureId))
            const finalizeDeferred = Effect.fn('CaptureCatalog.finalizeDeferred')(function* (
                captureId: string,
            ) {
                const capture = yield* get(captureId)
                if (capture.state !== 'deleting') return capture
                const ready = yield* mapRepository(repository.deletionReady(captureId))
                if (!ready) return capture
                yield* Effect.tryPromise({
                    try: () =>
                        Promise.all([
                            rm(paths.captureRoot(captureId), { recursive: true, force: true }),
                            rm(paths.exportRoot(captureId), { recursive: true, force: true }),
                        ]),
                    catch: (cause) =>
                        new CaptureStorageUnavailable({
                            title: 'Capture deletion failed',
                            message: String(cause),
                            retryable: true,
                        }),
                })
                const deleted = yield* mapRepository(repository.finalizeDelete(captureId))
                yield* realtime.publishCaptureDeleted(captureId)
                return deleted
            })
            const retained = yield* repository.list().pipe(Effect.mapError(catalogError))
            for (const capture of retained.captures) {
                if (capture.state === 'deleting') {
                    yield* finalizeDeferred(capture.captureId).pipe(Effect.ignore)
                }
            }
            return CaptureCatalog.of({
                list: () => repository.list().pipe(Effect.mapError(catalogError)),
                get,
                active: () => repository.active().pipe(Effect.mapError(catalogError)),
                open: Effect.fn('CaptureCatalog.open')(function* (captureId) {
                    const capture = yield* get(captureId)
                    return new OpenCaptureResult({
                        capture,
                        session: new CaptureSession({
                            captureId: capture.captureId,
                            state: sessionState(capture),
                            source: capture.source,
                            registryRevision: capture.registryRevision,
                            startedAtNs: capture.startedAtNs,
                            stoppedAtNs: capture.stoppedAtNs,
                            failure: capture.failure?.message ?? null,
                        }),
                    })
                }),
                delete: Effect.fn('CaptureCatalog.delete')(function* (captureId) {
                    const capture = yield* mapRepository(repository.requestDelete(captureId))
                    if (capture.state !== 'deleted') {
                        yield* realtime.publishCaptureRecord(capture)
                    }
                    return capture.state === 'deleting'
                        ? yield* finalizeDeferred(captureId)
                        : capture
                }),
                finalizeDeferred,
            })
        }),
    )
}

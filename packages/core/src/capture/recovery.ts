import { CaptureStorageUnavailable, type CaptureRpcError } from '@repo/shared/capture'
import { Context, Effect, Layer, Schema } from 'effect'

import { AppDataPaths } from '#core/storage'

import {
    CaptureRepositoryError,
    CaptureSessionRepository,
    StoredCaptureNotFound,
} from './capture-session-repository'
import { Capture } from './service'

type RecoveryError = Schema.Schema.Type<typeof CaptureRpcError>

function repositoryFailure(error: CaptureRepositoryError | StoredCaptureNotFound): RecoveryError {
    return new CaptureStorageUnavailable({
        title: 'Capture recovery storage failed',
        message:
            error._tag === 'CaptureRepositoryError'
                ? error.message
                : `Capture ${error.captureId} disappeared during recovery.`,
        retryable: true,
    })
}

export interface CaptureRecoveryService {
    readonly recoverInterrupted: () => Effect.Effect<void, RecoveryError>
}

export class CaptureRecovery extends Context.Tag('@repo/core/capture/CaptureRecovery')<
    CaptureRecovery,
    CaptureRecoveryService
>() {
    static readonly layer = Layer.effect(
        CaptureRecovery,
        Effect.gen(function* () {
            const capture = yield* Capture
            const repository = yield* CaptureSessionRepository
            const paths = yield* AppDataPaths
            const stored = <A>(
                effect: Effect.Effect<A, CaptureRepositoryError | StoredCaptureNotFound>,
            ) => effect.pipe(Effect.mapError(repositoryFailure))

            return CaptureRecovery.of({
                recoverInterrupted: Effect.fn('CaptureRecovery.recoverInterrupted')(function* () {
                    const records = yield* repository
                        .list()
                        .pipe(Effect.mapError(repositoryFailure))
                    for (const record of records.captures) {
                        if (!['interrupted', 'stopped', 'failed'].includes(record.state)) continue
                        const interrupted = record.state === 'interrupted'
                        if (interrupted) {
                            yield* stored(repository.transition(record.captureId, 'recovering'))
                        }
                        const recovered = yield* capture
                            .recoverSegments(
                                record.captureId,
                                paths.captureSegmentsRoot(record.captureId),
                                interrupted,
                            )
                            .pipe(Effect.either)
                        if (recovered._tag === 'Left') {
                            yield* stored(
                                repository.transition(record.captureId, 'failed', {
                                    failureCode: recovered.left._tag,
                                    failureMessage: recovered.left.message ?? recovered.left.title,
                                }),
                            )
                            continue
                        }
                        if (recovered.right.length === 0) {
                            yield* stored(
                                repository.transition(record.captureId, 'failed', {
                                    failureCode: 'RecoverySourceMissing',
                                    failureMessage:
                                        'No recoverable pcapng segment was found for the interrupted capture.',
                                }),
                            )
                            continue
                        }
                        yield* repository
                            .upsertSegments(record.captureId, recovered.right)
                            .pipe(Effect.mapError(repositoryFailure))
                        const packetCount = recovered.right
                            .reduce(
                                (total, segment) => total + BigInt(segment.committedPackets),
                                0n,
                            )
                            .toString()
                        const retainedBytes = recovered.right
                            .reduce((total, segment) => total + BigInt(segment.committedBytes), 0n)
                            .toString()
                        if (interrupted || record.state === 'stopped') {
                            yield* stored(
                                repository.transition(
                                    record.captureId,
                                    interrupted ? 'stopped' : record.state,
                                    {
                                        packetCount,
                                        retainedBytes,
                                        ...(interrupted
                                            ? { failureCode: null, failureMessage: null }
                                            : {}),
                                    },
                                ),
                            )
                        }
                    }
                }),
            })
        }),
    )
}

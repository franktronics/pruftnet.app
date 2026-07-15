import type { ExportFormat } from '@repo/shared/capture'
import { and, eq } from 'drizzle-orm'
import { Clock, Context, Data, Effect, Layer } from 'effect'

import { AppDataPaths, Database, exportArtifacts, type DatabaseError } from '#core/storage'

export class ExportRepositoryError extends Data.TaggedError('ExportRepositoryError')<{
    readonly operation: string
    readonly message: string
    readonly cause?: unknown
}> {}

export interface CachedExportArtifact {
    readonly captureId: string
    readonly format: ExportFormat
    readonly sourceFingerprint: string
    readonly artifactPath: string
    readonly retainedPortionOnly: boolean
    readonly checksumSha256: string
    readonly finalSize: string
}

export interface ExportSourceSegment {
    readonly ordinal: number
    readonly generation: number
    readonly path: string
    readonly committedBytes: string
    readonly committedPackets: string
}

function repositoryError(operation: string, cause: DatabaseError | unknown) {
    return new ExportRepositoryError({
        operation,
        message: `Export artifact repository operation failed: ${operation}`,
        cause,
    })
}

export interface ExportArtifactRepositoryService {
    readonly get: (
        captureId: string,
        format: ExportFormat,
    ) => Effect.Effect<CachedExportArtifact | undefined, ExportRepositoryError>
    readonly put: (
        artifact: CachedExportArtifact,
    ) => Effect.Effect<CachedExportArtifact, ExportRepositoryError>
    readonly remove: (
        captureId: string,
        format: ExportFormat,
    ) => Effect.Effect<void, ExportRepositoryError>
}

export class ExportArtifactRepository extends Context.Tag(
    '@repo/core/capture/ExportArtifactRepository',
)<ExportArtifactRepository, ExportArtifactRepositoryService>() {
    static readonly layer = Layer.effect(
        ExportArtifactRepository,
        Effect.gen(function* () {
            const database = yield* Database
            const paths = yield* AppDataPaths

            const get = Effect.fn('ExportArtifactRepository.get')(function* (
                captureId: string,
                format: ExportFormat,
            ) {
                const row = yield* database
                    .read('get cached export artifact', (db) =>
                        db
                            .select()
                            .from(exportArtifacts)
                            .where(
                                and(
                                    eq(exportArtifacts.captureId, captureId),
                                    eq(exportArtifacts.format, format),
                                ),
                            )
                            .get(),
                    )
                    .pipe(
                        Effect.mapError((cause) =>
                            repositoryError('get cached export artifact', cause),
                        ),
                    )
                return row
                    ? {
                          ...row,
                          artifactPath: paths.resolveExportArtifactPath(
                              captureId,
                              row.artifactPath,
                          ),
                      }
                    : undefined
            })

            return ExportArtifactRepository.of({
                get,
                put: Effect.fn('ExportArtifactRepository.put')(function* (artifact) {
                    const now = (yield* Clock.currentTimeNanos).toString()
                    const artifactPath = paths.resolveExportArtifactPath(
                        artifact.captureId,
                        artifact.artifactPath,
                    )
                    yield* database
                        .write('store cached export artifact', (db) =>
                            db
                                .insert(exportArtifacts)
                                .values({
                                    ...artifact,
                                    artifactPath,
                                    createdAtNs: now,
                                    updatedAtNs: now,
                                })
                                .onConflictDoUpdate({
                                    target: [exportArtifacts.captureId, exportArtifacts.format],
                                    set: {
                                        sourceFingerprint: artifact.sourceFingerprint,
                                        artifactPath,
                                        retainedPortionOnly: artifact.retainedPortionOnly,
                                        checksumSha256: artifact.checksumSha256,
                                        finalSize: artifact.finalSize,
                                        updatedAtNs: now,
                                    },
                                })
                                .run(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('store cached export artifact', cause),
                            ),
                        )
                    return artifact
                }),
                remove: Effect.fn('ExportArtifactRepository.remove')(function* (captureId, format) {
                    yield* database
                        .write('remove cached export artifact', (db) =>
                            db
                                .delete(exportArtifacts)
                                .where(
                                    and(
                                        eq(exportArtifacts.captureId, captureId),
                                        eq(exportArtifacts.format, format),
                                    ),
                                )
                                .run(),
                        )
                        .pipe(
                            Effect.mapError((cause) =>
                                repositoryError('remove cached export artifact', cause),
                            ),
                        )
                }),
            })
        }),
    )
}

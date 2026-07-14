import { constants } from 'node:fs'
import { access, mkdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'

import type {
    ExportDestination as ExportDestinationRequest,
    ExportFormat,
} from '@repo/shared/capture'
import { Context, Data, Effect, Layer } from 'effect'

import { AppDataPaths } from '#core/storage'

export class ExportDestinationError extends Data.TaggedError('ExportDestinationError')<{
    readonly code: 'InvalidToken' | 'InvalidPath' | 'Collision' | 'Unavailable'
    readonly message: string
    readonly cause?: unknown
}> {}

export interface PreparedExportDestination {
    readonly destinationKind: 'desktop' | 'server'
    readonly destinationToken?: string
    readonly artifactPath: string
    readonly partialPath: string
}

export type DesktopDestinationResolver = (
    token: string,
    format: ExportFormat,
) => Promise<string | undefined>

export interface ExportDestinationOptions {
    readonly resolveDesktopDestination?: DesktopDestinationResolver
}

export interface ExportDestinationService {
    readonly prepare: (
        exportId: string,
        format: ExportFormat,
        destination: ExportDestinationRequest,
    ) => Effect.Effect<PreparedExportDestination, ExportDestinationError>
}

async function exists(path: string) {
    return stat(path)
        .then(() => true)
        .catch(() => false)
}

function expectedExtension(format: ExportFormat) {
    return `.${format}`
}

export class ExportDestination extends Context.Tag('@repo/core/capture/ExportDestination')<
    ExportDestination,
    ExportDestinationService
>() {
    static layer(options: ExportDestinationOptions = {}) {
        return Layer.effect(
            ExportDestination,
            Effect.gen(function* () {
                const paths = yield* AppDataPaths
                return ExportDestination.of({
                    prepare: (exportId, format, destination) =>
                        Effect.tryPromise({
                            try: async () => {
                                if (destination._tag === 'Server') {
                                    const root = paths.exportRoot(exportId)
                                    await mkdir(root, { recursive: false, mode: 0o700 })
                                    const artifactPath = paths.resolveContained(
                                        resolve(root, `artifact.${format}`),
                                    )
                                    return {
                                        destinationKind: 'server' as const,
                                        artifactPath,
                                        partialPath: paths.resolveContained(
                                            resolve(root, 'artifact.partial'),
                                        ),
                                    }
                                }
                                if (
                                    paths.runtime !== 'desktop' ||
                                    !options.resolveDesktopDestination
                                ) {
                                    throw new ExportDestinationError({
                                        code: 'InvalidToken',
                                        message:
                                            'Desktop export destinations are unavailable in this runtime.',
                                    })
                                }
                                const selected = await options.resolveDesktopDestination(
                                    destination.destinationToken,
                                    format,
                                )
                                if (!selected || !isAbsolute(selected)) {
                                    throw new ExportDestinationError({
                                        code: 'InvalidToken',
                                        message:
                                            'The desktop export destination token is invalid or expired.',
                                    })
                                }
                                const parent = await realpath(dirname(selected))
                                await access(parent, constants.W_OK)
                                let artifactPath = resolve(parent, basename(selected))
                                if (
                                    extname(artifactPath).toLowerCase() !==
                                    expectedExtension(format)
                                ) {
                                    artifactPath += expectedExtension(format)
                                }
                                const partialPath = `${artifactPath}.partial`
                                if ((await exists(artifactPath)) || (await exists(partialPath))) {
                                    throw new ExportDestinationError({
                                        code: 'Collision',
                                        message:
                                            'The selected destination or its partial file already exists.',
                                    })
                                }
                                return {
                                    destinationKind: 'desktop' as const,
                                    destinationToken: destination.destinationToken,
                                    artifactPath,
                                    partialPath,
                                }
                            },
                            catch: (cause) =>
                                cause instanceof ExportDestinationError
                                    ? cause
                                    : new ExportDestinationError({
                                          code: 'Unavailable',
                                          message: 'Unable to prepare the export destination.',
                                          cause,
                                      }),
                        }),
                })
            }),
        )
    }
}

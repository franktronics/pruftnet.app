import { constants } from 'node:fs'
import { access, copyFile, mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, resolve } from 'node:path'

import type {
    ExportDestination as ExportDestinationRequest,
    ExportFormat,
} from '@repo/shared/capture'
import { Context, Data, Effect, Layer } from 'effect'

import { AppDataPaths } from '#core/storage'

export class ExportDestinationError extends Data.TaggedError('ExportDestinationError')<{
    readonly code: 'InvalidToken' | 'InvalidPath' | 'Unavailable'
    readonly message: string
    readonly cause?: unknown
}> {}

export interface ExportCachePaths {
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
    readonly cachePaths: (
        captureId: string,
        format: ExportFormat,
    ) => Effect.Effect<ExportCachePaths, ExportDestinationError>
    readonly deliver: (
        format: ExportFormat,
        destination: ExportDestinationRequest,
        sourcePath: string,
    ) => Effect.Effect<'desktop' | 'server', ExportDestinationError>
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
                    cachePaths: (captureId, format) =>
                        Effect.tryPromise({
                            try: async () => {
                                const root = paths.exportRoot(captureId)
                                await mkdir(root, { recursive: true, mode: 0o700 })
                                return {
                                    artifactPath: paths.resolveExportArtifactPath(
                                        captureId,
                                        resolve(root, `artifact.${format}`),
                                    ),
                                    partialPath: paths.resolveExportArtifactPath(
                                        captureId,
                                        resolve(root, `artifact.${format}.partial`),
                                    ),
                                }
                            },
                            catch: (cause) =>
                                new ExportDestinationError({
                                    code: 'Unavailable',
                                    message: 'Unable to prepare the export cache.',
                                    cause,
                                }),
                        }),
                    deliver: (format, destination, sourcePath) => {
                        if (destination._tag === 'Server') return Effect.succeed('server' as const)
                        return Effect.tryPromise({
                            try: async () => {
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
                                try {
                                    await rm(partialPath, { force: true })
                                    await copyFile(sourcePath, partialPath)
                                    const handle = await open(partialPath, 'r')
                                    await handle.sync().finally(() => handle.close())
                                    await rm(artifactPath, { force: true })
                                    await rename(partialPath, artifactPath)
                                } catch (cause) {
                                    await rm(partialPath, { force: true }).catch(() => undefined)
                                    throw cause
                                }
                                return 'desktop' as const
                            },
                            catch: (cause) =>
                                cause instanceof ExportDestinationError
                                    ? cause
                                    : new ExportDestinationError({
                                          code: 'Unavailable',
                                          message: 'Unable to deliver the desktop export.',
                                          cause,
                                      }),
                        })
                    },
                })
            }),
        )
    }
}

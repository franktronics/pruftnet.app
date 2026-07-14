import { homedir, platform } from 'node:os'
import { isAbsolute, relative, resolve } from 'node:path'
import { mkdir, realpath } from 'node:fs/promises'

import { Context, Effect, Layer } from 'effect'

import { AppDataPathError } from './errors'

export type AppRuntime = 'desktop' | 'server' | 'test'
export type AppEnvironment = 'development' | 'production' | 'test'

export interface AppDataPathsOptions {
    readonly runtime: AppRuntime
    readonly environment: AppEnvironment
    readonly workspaceRoot?: string
    readonly dataRoot?: string
}

export interface ResolvedAppDataPaths {
    readonly runtime: AppRuntime
    readonly environment: AppEnvironment
    readonly dataRoot: string
    readonly databasePath: string
    readonly capturesRoot: string
    readonly exportsRoot: string
    readonly locksRoot: string
    readonly instanceLockPath: string
    readonly captureRoot: (captureId: string) => string
    readonly captureSegmentsRoot: (captureId: string) => string
    readonly captureIndexesRoot: (captureId: string) => string
    readonly captureRecoveryRoot: (captureId: string) => string
    readonly resolveCaptureSegmentPath: (captureId: string, path: string) => string
    readonly exportRoot: (exportId: string) => string
    readonly resolveExportArtifactPath: (exportId: string, path: string) => string
    readonly resolveContained: (path: string) => string
}

function platformDataRoot(appName: string) {
    const home = homedir()
    switch (platform()) {
        case 'darwin':
            return resolve(home, 'Library', 'Application Support', appName)
        case 'win32':
            return resolve(process.env.LOCALAPPDATA ?? resolve(home, 'AppData', 'Local'), appName)
        default:
            return resolve(process.env.XDG_DATA_HOME ?? resolve(home, '.local', 'share'), appName)
    }
}

function defaultDataRoot(options: AppDataPathsOptions) {
    if (options.dataRoot) return resolve(options.dataRoot)
    if (options.runtime === 'test') {
        throw new AppDataPathError({
            message: 'Tests must provide a unique data root.',
        })
    }
    if (options.environment === 'development') {
        if (!options.workspaceRoot) {
            throw new AppDataPathError({
                message: 'Development data paths require the workspace root.',
            })
        }
        return resolve(options.workspaceRoot, '.data', options.runtime)
    }
    if (options.runtime === 'server' && process.env.PRUFTNET_DATA_DIR) {
        return resolve(process.env.PRUFTNET_DATA_DIR)
    }
    return platformDataRoot(options.runtime === 'desktop' ? 'Pruftnet' : 'pruftnet-server')
}

function isContained(root: string, candidate: string) {
    const child = relative(root, candidate)
    return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

export class AppDataPaths extends Context.Tag('@repo/core/storage/AppDataPaths')<
    AppDataPaths,
    ResolvedAppDataPaths
>() {
    static layer(options: AppDataPathsOptions) {
        return Layer.effect(
            AppDataPaths,
            Effect.tryPromise({
                try: async () => {
                    const requestedRoot = defaultDataRoot(options)
                    await mkdir(requestedRoot, { recursive: true, mode: 0o700 })
                    const dataRoot = await realpath(requestedRoot)
                    const capturesRoot = resolve(dataRoot, 'captures')
                    const exportsRoot = resolve(dataRoot, 'exports')
                    const locksRoot = resolve(dataRoot, 'locks')
                    await Promise.all(
                        [capturesRoot, exportsRoot, locksRoot].map((path) =>
                            mkdir(path, { recursive: true, mode: 0o700 }),
                        ),
                    )
                    const resolveContained = (path: string) => {
                        const candidate = resolve(path)
                        if (!isContained(dataRoot, candidate)) {
                            throw new AppDataPathError({
                                message: `Path is outside the application data root: ${candidate}`,
                            })
                        }
                        return candidate
                    }
                    const captureRoot = (captureId: string) =>
                        resolveContained(resolve(capturesRoot, captureId))
                    const exportRoot = (exportId: string) =>
                        resolveContained(resolve(exportsRoot, exportId))
                    return AppDataPaths.of({
                        runtime: options.runtime,
                        environment: options.environment,
                        dataRoot,
                        databasePath: resolveContained(resolve(dataRoot, 'pruftnet.sqlite')),
                        capturesRoot,
                        exportsRoot,
                        locksRoot,
                        instanceLockPath: resolveContained(resolve(locksRoot, 'instance.lock')),
                        captureRoot,
                        captureSegmentsRoot: (captureId: string) =>
                            resolve(captureRoot(captureId), 'segments'),
                        captureIndexesRoot: (captureId: string) =>
                            resolve(captureRoot(captureId), 'indexes'),
                        captureRecoveryRoot: (captureId: string) =>
                            resolve(captureRoot(captureId), 'recovery'),
                        resolveCaptureSegmentPath: (captureId: string, path: string) => {
                            const segmentRoot = resolve(captureRoot(captureId), 'segments')
                            const candidate = resolveContained(path)
                            if (!isContained(segmentRoot, candidate)) {
                                throw new AppDataPathError({
                                    message: `Path is outside capture ${captureId}: ${candidate}`,
                                })
                            }
                            return candidate
                        },
                        exportRoot,
                        resolveExportArtifactPath: (exportId: string, path: string) => {
                            const root = exportRoot(exportId)
                            const candidate = resolveContained(path)
                            if (!isContained(root, candidate)) {
                                throw new AppDataPathError({
                                    message: `Path is outside export ${exportId}: ${candidate}`,
                                })
                            }
                            return candidate
                        },
                        resolveContained,
                    })
                },
                catch: (cause) =>
                    cause instanceof AppDataPathError
                        ? cause
                        : new AppDataPathError({
                              message: 'Unable to initialize application data paths.',
                              cause,
                          }),
            }),
        )
    }
}

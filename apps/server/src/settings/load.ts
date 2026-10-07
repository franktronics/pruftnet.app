import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { resolveAppDataRoot } from '@repo/core'
import { Effect } from 'effect'

import { CliError, ExitCode } from '#server/errors'
import type { RuntimePaths } from '#server/runtime-paths'

import {
    configEnvironmentVariable,
    currentConfigLocation,
    defaultConfigFilePath,
    defaultPort,
    parseConfigFile,
    resolveSettings,
    type SettingFlags,
    type SettingValues,
} from './settings'

export interface ConfigFileLocation {
    readonly path: string
    /** Set by `--config` or `PRUFTNET_CONFIG`: the file must then exist. */
    readonly explicit: boolean
}

export function locateConfigFile(
    flag: string | undefined,
    paths: RuntimePaths,
): ConfigFileLocation {
    const explicit = flag ?? (process.env[configEnvironmentVariable] || undefined)
    if (explicit !== undefined) return { path: resolve(explicit), explicit: true }
    return {
        path: defaultConfigFilePath(currentConfigLocation(paths.mode, paths.workspaceRoot)),
        explicit: false,
    }
}

function isMissingFile(cause: unknown) {
    return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}

const readConfigFile = Effect.fn('readConfigFile')(function* (location: ConfigFileLocation) {
    const text = yield* Effect.tryPromise({
        try: () =>
            readFile(location.path, 'utf8').catch((cause: unknown) => {
                // The default file is optional; an explicitly requested one is not.
                if (isMissingFile(cause) && !location.explicit) return undefined
                throw cause
            }),
        catch: (cause) =>
            new CliError({
                message: isMissingFile(cause)
                    ? `Configuration file ${location.path} does not exist.`
                    : `Unable to read configuration file ${location.path}: ${String(cause)}`,
                exitCode: ExitCode.usage,
            }),
    })
    return text === undefined ? undefined : yield* parseConfigFile(location.path, text)
})

export function defaultSettingValues(paths: RuntimePaths): SettingValues {
    return {
        host: '127.0.0.1',
        port: defaultPort(),
        dataDir: resolveAppDataRoot({
            runtime: 'server',
            environment: paths.mode,
            workspaceRoot: paths.workspaceRoot,
        }),
        logLevel: 'info',
        logFormat: 'pretty',
        strictPort: false,
    }
}

export interface LoadSettingsInput {
    readonly flags: SettingFlags
    readonly config: string | undefined
    readonly paths: RuntimePaths
}

/** Reads the configuration file and the environment, then resolves every setting. */
export const loadSettings = Effect.fn('loadSettings')(function* (input: LoadSettingsInput) {
    const file = yield* readConfigFile(locateConfigFile(input.config, input.paths))
    const defaults = yield* Effect.try({
        try: () => defaultSettingValues(input.paths),
        catch: (cause) =>
            new CliError({
                message: `Unable to determine the default data directory: ${String(cause)}`,
                exitCode: ExitCode.failure,
            }),
    })
    return yield* resolveSettings({
        flags: input.flags,
        environment: process.env,
        file,
        defaults,
        cwd: process.cwd(),
    })
})

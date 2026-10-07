import { homedir } from 'node:os'
import { dirname, isAbsolute, resolve } from 'node:path'

import { releaseChannel, releaseCommand, releaseName } from '@repo/core'
import { Either, type ParseResult, Schema } from 'effect'

import { CliError, ExitCode } from '#server/errors'
import type { ServerMode } from '#server/runtime-paths'

export const loopbackHosts = ['127.0.0.1', 'localhost', '::1'] as const
// Same names as the built-in @effect/cli `--log-level` option.
export const logLevels = [
    'all',
    'trace',
    'debug',
    'info',
    'warning',
    'error',
    'fatal',
    'none',
] as const
export const logFormats = ['pretty', 'logfmt', 'json'] as const

export type Host = (typeof loopbackHosts)[number]
export type LogLevelName = (typeof logLevels)[number]
export type LogFormat = (typeof logFormats)[number]

export interface SettingValues {
    host: Host
    port: number
    dataDir: string
    logLevel: LogLevelName
    logFormat: LogFormat
    strictPort: boolean
}
export type SettingKey = keyof SettingValues

/** Where an effective value comes from, by decreasing precedence. */
export type SettingSource = 'flag' | 'environment' | 'file' | 'default'
export interface Setting<A> {
    readonly value: A
    readonly source: SettingSource
}

export type ServerSettings = {
    readonly [K in SettingKey]: Setting<SettingValues[K]>
} & {
    /** Configuration file that was read, if any. */
    readonly configFile: string | undefined
}

/** Raw command line values. The CLI parser only checks their primitive type. */
export type SettingFlags = { readonly [K in SettingKey]?: unknown }

export interface ConfigFile {
    readonly path: string
    readonly values: Readonly<Record<string, unknown>>
}

type Decoder<A> = (raw: unknown) => Either.Either<A, ParseResult.ParseError>

interface SettingDefinition<A> {
    readonly flag: string
    readonly environment: string
    readonly expected: string
    /** Decodes typed values from flags and the configuration file. */
    readonly value: Decoder<A>
    /** Decodes environment variables. */
    readonly text: Decoder<A>
}

const Port = Schema.Int.pipe(Schema.between(1, 65535))
const BooleanFromText = Schema.transform(
    Schema.Literal('true', 'false', '1', '0'),
    Schema.Boolean,
    {
        strict: true,
        decode: (value) => value === 'true' || value === '1',
        encode: (value) => (value ? 'true' : 'false'),
    },
)

const decodeHost = Schema.decodeUnknownEither(Schema.Literal(...loopbackHosts))
const decodeLogLevel = Schema.decodeUnknownEither(Schema.Literal(...logLevels))
const decodeLogFormat = Schema.decodeUnknownEither(Schema.Literal(...logFormats))
const decodePath = Schema.decodeUnknownEither(Schema.NonEmptyTrimmedString)

const definitions: { readonly [K in SettingKey]: SettingDefinition<SettingValues[K]> } = {
    host: {
        flag: '--host',
        environment: 'PRUFTNET_HOST',
        expected: `a loopback address (${loopbackHosts.join(', ')}); remote access is disabled until authentication is implemented`,
        value: decodeHost,
        text: decodeHost,
    },
    port: {
        flag: '--port',
        environment: 'PRUFTNET_PORT',
        expected: 'an integer between 1 and 65535',
        value: Schema.decodeUnknownEither(Port),
        text: Schema.decodeUnknownEither(Schema.compose(Schema.NumberFromString, Port)),
    },
    dataDir: {
        flag: '--data-dir',
        environment: 'PRUFTNET_DATA_DIR',
        expected: 'a non-empty path',
        value: decodePath,
        text: decodePath,
    },
    logLevel: {
        flag: '--log-level',
        environment: 'PRUFTNET_LOG_LEVEL',
        expected: `one of ${logLevels.join(', ')}`,
        value: decodeLogLevel,
        text: decodeLogLevel,
    },
    logFormat: {
        flag: '--log-format',
        environment: 'PRUFTNET_LOG_FORMAT',
        expected: `one of ${logFormats.join(', ')}`,
        value: decodeLogFormat,
        text: decodeLogFormat,
    },
    strictPort: {
        flag: '--strict-port',
        environment: 'PRUFTNET_STRICT_PORT',
        expected: 'true or false',
        value: Schema.decodeUnknownEither(Schema.Boolean),
        text: Schema.decodeUnknownEither(BooleanFromText),
    },
}

export const settingKeys = Object.keys(definitions) as ReadonlyArray<SettingKey>
export const configEnvironmentVariable = 'PRUFTNET_CONFIG'

export function settingFlag(key: SettingKey) {
    return definitions[key].flag
}

export function settingEnvironmentVariable(key: SettingKey) {
    return definitions[key].environment
}

export function defaultPort() {
    return releaseChannel === 'nightly' ? 3001 : 3000
}

function usageError(message: string) {
    return new CliError({ message, exitCode: ExitCode.usage })
}

function decode<A>(
    decoder: Decoder<A>,
    raw: unknown,
    origin: string,
    expected: string,
): Either.Either<A, CliError> {
    return decoder(raw).pipe(
        Either.mapLeft(() =>
            usageError(`Invalid ${origin} ${JSON.stringify(raw)}: expected ${expected}.`),
        ),
    )
}

export interface ResolveSettingsInput {
    readonly flags: SettingFlags
    readonly environment: Readonly<Record<string, string | undefined>>
    readonly file: ConfigFile | undefined
    readonly defaults: SettingValues
    readonly cwd: string
}

function resolveSetting<K extends SettingKey>(
    key: K,
    input: ResolveSettingsInput,
): Either.Either<Setting<SettingValues[K]>, CliError> {
    const definition = definitions[key]
    const fromFlag = input.flags[key]
    if (fromFlag !== undefined) {
        return decode(definition.value, fromFlag, definition.flag, definition.expected).pipe(
            Either.map((value) => ({ value, source: 'flag' as const })),
        )
    }
    const fromEnvironment = input.environment[definition.environment]
    if (fromEnvironment !== undefined && fromEnvironment !== '') {
        return decode(
            definition.text,
            fromEnvironment,
            definition.environment,
            definition.expected,
        ).pipe(Either.map((value) => ({ value, source: 'environment' as const })))
    }
    if (input.file && key in input.file.values) {
        return decode(
            definition.value,
            input.file.values[key],
            `"${key}" in ${input.file.path}`,
            definition.expected,
        ).pipe(Either.map((value) => ({ value, source: 'file' as const })))
    }
    return Either.right({ value: input.defaults[key], source: 'default' })
}

/** Applies flag > environment > configuration file > default precedence and validates values. */
export function resolveSettings(
    input: ResolveSettingsInput,
): Either.Either<ServerSettings, CliError> {
    return Either.gen(function* () {
        const dataDir = yield* resolveSetting('dataDir', input)
        // Relative paths follow the file that declares them, like most configuration formats.
        const dataDirBase =
            dataDir.source === 'file' && input.file ? dirname(input.file.path) : input.cwd
        return {
            configFile: input.file?.path,
            host: yield* resolveSetting('host', input),
            port: yield* resolveSetting('port', input),
            dataDir: {
                source: dataDir.source,
                value: isAbsolute(dataDir.value)
                    ? dataDir.value
                    : resolve(dataDirBase, dataDir.value),
            },
            logLevel: yield* resolveSetting('logLevel', input),
            logFormat: yield* resolveSetting('logFormat', input),
            strictPort: yield* resolveSetting('strictPort', input),
        }
    })
}

/** Parses a JSON configuration file and rejects keys that are not settings. */
export function parseConfigFile(path: string, text: string): Either.Either<ConfigFile, CliError> {
    let parsed: unknown
    try {
        parsed = JSON.parse(text)
    } catch (cause) {
        return Either.left(
            usageError(`Configuration file ${path} is not valid JSON: ${String(cause)}`),
        )
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return Either.left(usageError(`Configuration file ${path} must contain a JSON object.`))
    }
    const unknownKeys = Object.keys(parsed).filter(
        (key) => !settingKeys.includes(key as SettingKey),
    )
    if (unknownKeys.length > 0) {
        return Either.left(
            usageError(
                `Unknown setting ${unknownKeys.map((key) => `"${key}"`).join(', ')} in ${path}. Supported settings: ${settingKeys.join(', ')}.`,
            ),
        )
    }
    return Either.right({ path, values: parsed as Record<string, unknown> })
}

export interface ConfigLocationInput {
    readonly mode: ServerMode
    readonly workspaceRoot: string
    readonly environment: Readonly<Record<string, string | undefined>>
    readonly platform: NodeJS.Platform
    readonly home: string
}

/** Per-user configuration file read when neither `--config` nor `PRUFTNET_CONFIG` is set. */
export function defaultConfigFilePath(input: ConfigLocationInput) {
    if (input.mode === 'development') {
        return resolve(input.workspaceRoot, '.data', 'pruftnet', 'server.json')
    }
    switch (input.platform) {
        case 'darwin':
            return resolve(input.home, 'Library', 'Application Support', releaseName, 'server.json')
        case 'win32':
            return resolve(
                input.environment.APPDATA ?? resolve(input.home, 'AppData', 'Roaming'),
                releaseName,
                'server.json',
            )
        default:
            return resolve(
                input.environment.XDG_CONFIG_HOME ?? resolve(input.home, '.config'),
                releaseCommand,
                'server.json',
            )
    }
}

export function currentConfigLocation(
    mode: ServerMode,
    workspaceRoot: string,
): ConfigLocationInput {
    return {
        mode,
        workspaceRoot,
        environment: process.env,
        platform: process.platform,
        home: homedir(),
    }
}

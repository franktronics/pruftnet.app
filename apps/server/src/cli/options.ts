import { Options } from '@effect/cli'
import { Context, Option } from 'effect'

import {
    configEnvironmentVariable,
    defaultPort,
    logFormats,
    loopbackHosts,
    settingEnvironmentVariable,
    type SettingFlags,
} from '#server/settings/settings'

const environmentHint = (variable: string) => ` [env: ${variable}]`

export const configOption = Options.text('config').pipe(
    Options.withAlias('c'),
    Options.withDescription(
        `JSON configuration file. Defaults to the per-user file printed by "config path".${environmentHint(configEnvironmentVariable)}`,
    ),
    Options.optional,
)

export const jsonOption = Options.boolean('json').pipe(
    Options.withDescription('Print machine-readable JSON.'),
)

/** Options shared by every command that resolves server settings. */
export const settingOptions = {
    config: configOption,
    host: Options.text('host').pipe(
        Options.withDescription(
            `Loopback address to bind: ${loopbackHosts.join(', ')}. Default 127.0.0.1.${environmentHint(settingEnvironmentVariable('host'))}`,
        ),
        Options.optional,
    ),
    port: Options.integer('port').pipe(
        Options.withAlias('p'),
        Options.withDescription(
            `Port to listen on. Default ${defaultPort()}.${environmentHint(settingEnvironmentVariable('port'))}`,
        ),
        Options.optional,
    ),
    // A boolean option cannot tell "absent" from "false", so each value has its own flag.
    strictPort: Options.boolean('strict-port').pipe(
        Options.withDescription(
            `Fail instead of trying the next free port when the port is in use.${environmentHint(settingEnvironmentVariable('strictPort'))}`,
        ),
    ),
    noStrictPort: Options.boolean('no-strict-port').pipe(
        Options.withDescription('Try the next free ports when the port is in use. Default.'),
    ),
    dataDir: Options.text('data-dir').pipe(
        Options.withDescription(
            `Directory for the database, captures and exports.${environmentHint(settingEnvironmentVariable('dataDir'))}`,
        ),
        Options.optional,
    ),
    logFormat: Options.choice('log-format', logFormats).pipe(
        Options.withDescription(
            `Log output format. Default pretty.${environmentHint(settingEnvironmentVariable('logFormat'))}`,
        ),
        Options.optional,
    ),
}

/**
 * `--log-level` cannot be declared per command: @effect/cli reserves it as a built-in option and
 * only recognizes it in some argument orders. It is removed before parsing and provided to
 * commands through this service, so it keeps flag precedence over the environment and file.
 */
export class LogLevelFlag extends Context.Tag('@repo/server/cli/LogLevelFlag')<
    LogLevelFlag,
    string | undefined
>() {}

/** Removes `--log-level <level>` and `--log-level=<level>`; the last occurrence wins. */
export function extractLogLevel(args: ReadonlyArray<string>) {
    const remaining: string[] = []
    let logLevel: string | undefined
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!
        if (arg === '--log-level') {
            logLevel = args[index + 1] ?? ''
            index += 1
        } else if (arg.startsWith('--log-level=')) {
            logLevel = arg.slice('--log-level='.length)
        } else {
            remaining.push(arg)
        }
    }
    return { args: remaining, logLevel }
}

interface ParsedSettingOptions {
    readonly host: Option.Option<string>
    readonly port: Option.Option<number>
    readonly strictPort: boolean
    readonly noStrictPort: boolean
    readonly dataDir: Option.Option<string>
    readonly logFormat: Option.Option<string>
}

function strictPortFlag(parsed: ParsedSettingOptions) {
    if (parsed.strictPort) return true
    if (parsed.noStrictPort) return false
    return undefined
}

export function toSettingFlags(
    parsed: ParsedSettingOptions,
    logLevel: string | undefined,
): SettingFlags {
    return {
        host: Option.getOrUndefined(parsed.host),
        port: Option.getOrUndefined(parsed.port),
        strictPort: strictPortFlag(parsed),
        dataDir: Option.getOrUndefined(parsed.dataDir),
        logLevel,
        logFormat: Option.getOrUndefined(parsed.logFormat),
    }
}

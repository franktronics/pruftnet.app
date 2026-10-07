import { Command, Options } from '@effect/cli'
import {
    AppDataPathError,
    InstanceLockError,
    releaseCommand,
    releaseName,
    releaseVersion,
} from '@repo/core'
import { Effect, Option } from 'effect'

import { CliError, ExitCode } from '#server/errors'
import { loggingLayer } from '#server/logging'
import { openBrowser } from '#server/open-browser'
import { resolveRuntimePaths, type RuntimePaths } from '#server/runtime-paths'
import { PortUnavailable, startServer } from '#server/server'
import { loadSettings } from '#server/settings/load'
import type { ServerSettings } from '#server/settings/settings'

import { LogLevelFlag, settingOptions, toSettingFlags } from './options'

function portHint(error: PortUnavailable, strictPort: boolean) {
    switch (error.reason) {
        case 'in_use':
            return strictPort
                ? 'Choose another port with --port, or omit --strict-port to try the next free ports.'
                : `Choose another port with --port, or run "${releaseCommand} doctor" to see what is listening.`
        case 'permission_denied':
            return 'Ports below 1024 need elevated privileges. Choose a port above 1023.'
        case 'unavailable':
            return undefined
    }
}

const toStartupError = (settings: ServerSettings) => (error: unknown) => {
    if (error instanceof PortUnavailable) {
        return new CliError({
            message: error.message,
            exitCode: ExitCode.portUnavailable,
            hint: portHint(error, settings.strictPort.value),
        })
    }
    if (error instanceof InstanceLockError) {
        return new CliError({
            message: error.message,
            exitCode: ExitCode.failure,
            hint: `Another ${releaseName} server already uses ${settings.dataDir.value}. Stop it, or pass --data-dir to start a separate instance.`,
        })
    }
    if (error instanceof AppDataPathError) {
        return new CliError({
            message: `${error.message} (${settings.dataDir.value})`,
            exitCode: ExitCode.failure,
            hint: 'Check that the data directory is writable, or pass --data-dir.',
        })
    }
    return error
}

const runServer = Effect.fn('runServer')(function* (
    settings: ServerSettings,
    paths: RuntimePaths,
    open: boolean,
) {
    yield* Effect.log(`Starting ${releaseName} ${releaseVersion} in ${paths.mode} mode`)
    yield* Effect.logDebug(
        `Data directory ${settings.dataDir.value}; configuration file ${settings.configFile ?? 'none'}`,
    )
    const server = yield* startServer({
        host: settings.host.value,
        port: settings.port.value,
        strictPort: settings.strictPort.value,
        dataDir: settings.dataDir.value,
        paths,
    }).pipe(Effect.mapError(toStartupError(settings)))
    yield* Effect.log(`Listening on ${server.url}`)
    if (open) yield* openBrowser(server.url)
    yield* Effect.never.pipe(
        Effect.ensuring(server.close.pipe(Effect.catchAll((error) => Effect.logError(error)))),
    )
})

export const serveCommand = Command.make(
    'serve',
    {
        ...settingOptions,
        open: Options.boolean('open').pipe(
            Options.withDescription('Open the interface in the default browser once ready.'),
        ),
    },
    (input) =>
        Effect.gen(function* () {
            const paths = resolveRuntimePaths()
            const settings = yield* loadSettings({
                flags: toSettingFlags(input, yield* LogLevelFlag),
                config: Option.getOrUndefined(input.config),
                paths,
            })
            yield* runServer(settings, paths, input.open).pipe(
                Effect.provide(loggingLayer(settings.logFormat.value, settings.logLevel.value)),
            )
        }),
).pipe(Command.withDescription('Start the local web server. Stop it with Ctrl+C or SIGTERM.'))

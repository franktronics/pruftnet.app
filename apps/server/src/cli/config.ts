import { Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'

import { resolveRuntimePaths } from '#server/runtime-paths'
import { loadSettings, locateConfigFile } from '#server/settings/load'
import {
    settingEnvironmentVariable,
    settingKeys,
    type ServerSettings,
} from '#server/settings/settings'

import { configOption, jsonOption, LogLevelFlag, settingOptions, toSettingFlags } from './options'
import { formatTable, printJson } from './output'

function settingsAsJson(settings: ServerSettings) {
    return {
        configFile: settings.configFile ?? null,
        settings: Object.fromEntries(settingKeys.map((key) => [key, settings[key]])),
    }
}

function settingsAsTable(settings: ServerSettings) {
    const rows = settingKeys.map((key) => {
        const setting = settings[key]
        const source =
            setting.source === 'environment'
                ? `environment (${settingEnvironmentVariable(key)})`
                : setting.source
        return [key, String(setting.value), source]
    })
    return `${formatTable([['SETTING', 'VALUE', 'SOURCE'], ...rows])}\n\nConfiguration file: ${settings.configFile ?? 'none'}`
}

const showCommand = Command.make('show', { ...settingOptions, json: jsonOption }, (input) =>
    Effect.gen(function* () {
        const settings = yield* loadSettings({
            flags: toSettingFlags(input, yield* LogLevelFlag),
            config: Option.getOrUndefined(input.config),
            paths: resolveRuntimePaths(),
        })
        yield* input.json
            ? printJson(settingsAsJson(settings))
            : Console.log(settingsAsTable(settings))
    }),
).pipe(
    Command.withDescription(
        'Print the effective settings and where each value comes from (flag, environment, file or default).',
    ),
)

const pathCommand = Command.make('path', { config: configOption }, (input) =>
    Console.log(locateConfigFile(Option.getOrUndefined(input.config), resolveRuntimePaths()).path),
).pipe(Command.withDescription('Print the configuration file path, whether or not it exists.'))

export const configCommand = Command.make('config').pipe(
    Command.withDescription('Inspect server configuration.'),
    Command.withSubcommands([showCommand, pathCommand]),
)

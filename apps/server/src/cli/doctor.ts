import { Command } from '@effect/cli'
import { Console, Effect, Option } from 'effect'

import { runDoctor, type CheckStatus, type DoctorCheck } from '#server/doctor'
import { CliError, ExitCode } from '#server/errors'
import { resolveRuntimePaths } from '#server/runtime-paths'
import { loadSettings } from '#server/settings/load'

import { jsonOption, LogLevelFlag, settingOptions, toSettingFlags } from './options'
import { formatTable, printJson } from './output'

const statusLabels: Record<CheckStatus, string> = { ok: 'ok', warning: 'warn', error: 'FAIL' }

function checksAsText(checks: ReadonlyArray<DoctorCheck>) {
    const table = formatTable(
        checks.map((item) => [statusLabels[item.status], item.name, item.detail]),
    )
    const hints = checks
        .filter((item) => item.hint !== undefined)
        .map((item) => `- ${item.name}: ${item.hint}`)
    return hints.length > 0 ? `${table}\n\nHow to fix:\n${hints.join('\n')}` : table
}

export const doctorCommand = Command.make(
    'doctor',
    { ...settingOptions, json: jsonOption },
    (input) =>
        Effect.gen(function* () {
            const paths = resolveRuntimePaths()
            const settings = yield* Effect.either(
                loadSettings({
                    flags: toSettingFlags(input, yield* LogLevelFlag),
                    config: Option.getOrUndefined(input.config),
                    paths,
                }),
            )
            const checks = yield* runDoctor({ paths, settings })
            const failed = checks.filter((item) => item.status === 'error').length
            yield* input.json
                ? printJson({ ok: failed === 0, checks })
                : Console.log(checksAsText(checks))
            if (failed > 0) {
                return yield* new CliError({
                    message: `${failed} check${failed === 1 ? '' : 's'} failed.`,
                    exitCode: ExitCode.failure,
                })
            }
        }),
).pipe(
    Command.withDescription(
        'Check the configuration, data directory, port, native worker and capture permissions.',
    ),
)

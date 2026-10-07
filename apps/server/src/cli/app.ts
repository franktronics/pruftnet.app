import { Command, HelpDoc } from '@effect/cli'
import { releaseCommand, releaseName, releaseVersion } from '@repo/core'

import { ExitCode } from '#server/errors'

import { configCommand } from './config'
import { doctorCommand } from './doctor'
import { interfacesCommand } from './interfaces'
import { serveCommand } from './serve'

const rootCommand = Command.make(releaseCommand).pipe(
    Command.withDescription(
        `${releaseName} local web server. It binds only to loopback addresses until authentication is implemented.`,
    ),
    Command.withSubcommands([serveCommand, doctorCommand, interfacesCommand, configCommand]),
)

const footer = HelpDoc.blocks([
    HelpDoc.h1('EXIT CODES'),
    HelpDoc.p(
        `${ExitCode.success} success, ${ExitCode.failure} failure, ${ExitCode.usage} invalid usage or configuration, ${ExitCode.portUnavailable} port unavailable.`,
    ),
    HelpDoc.h1('SETTINGS'),
    HelpDoc.p(
        'Flags override environment variables, which override the configuration file. --log-level <all|trace|debug|info|warning|error|fatal|none> applies to every command (env: PRUFTNET_LOG_LEVEL, file key: logLevel).',
    ),
    HelpDoc.p('Documentation: https://pruftnet.app'),
])

export const runCli = Command.run(rootCommand, {
    name: releaseName,
    version: releaseVersion,
    executable: releaseCommand,
    footer,
})

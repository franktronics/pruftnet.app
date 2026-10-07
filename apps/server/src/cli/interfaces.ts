import { Command } from '@effect/cli'
import type { CaptureInterface } from '@repo/shared/capture'
import { Console, Effect } from 'effect'

import { describeError, withCaptureWorker } from '#server/capture-probe'
import { CliError, ExitCode } from '#server/errors'
import { resolveRuntimePaths } from '#server/runtime-paths'

import { jsonOption } from './options'
import { formatTable, printJson } from './output'

function interfaceFlags(item: CaptureInterface) {
    return [
        item.isUp ? 'up' : 'down',
        item.isRunning ? 'running' : undefined,
        item.isLoopback ? 'loopback' : undefined,
        item.isWireless ? 'wireless' : undefined,
    ]
        .filter((flag) => flag !== undefined)
        .join(',')
}

function interfacesAsTable(interfaces: ReadonlyArray<CaptureInterface>) {
    if (interfaces.length === 0) return 'No capture interfaces found.'
    return formatTable([
        ['NAME', 'FLAGS', 'ADDRESSES', 'DESCRIPTION'],
        ...interfaces.map((item) => [
            item.name,
            interfaceFlags(item),
            item.addresses.map((address) => address.address).join(', ') || '-',
            item.description || '-',
        ]),
    ])
}

export const interfacesCommand = Command.make('interfaces', { json: jsonOption }, (input) =>
    withCaptureWorker(resolveRuntimePaths(), (capture) => capture.listInterfaces()).pipe(
        Effect.mapError(
            (error) =>
                new CliError({
                    message: `Unable to list capture interfaces: ${describeError(error)}`,
                    exitCode: ExitCode.failure,
                    hint: 'Run "doctor" to check the capture worker and permissions.',
                }),
        ),
        Effect.flatMap((interfaces) =>
            input.json ? printJson(interfaces) : Console.log(interfacesAsTable(interfaces)),
        ),
    ),
).pipe(Command.withDescription('List the capture interfaces reported by the native worker.'))

import { NodeRuntime } from '@effect/platform-node'
import { Effect } from 'effect'
import { releaseName, releaseVersion } from '@repo/core'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import { loadServerConfig } from './config'
import { startServer } from './server'

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        port: { type: 'string' },
        host: { type: 'string' },
        'data-dir': { type: 'string' },
    },
})
if (values.version) {
    console.log(`${releaseName} ${releaseVersion}`)
    process.exit(0)
}
if (values.help || positionals.length === 0) {
    console.log(
        `${releaseName} ${releaseVersion}\nUsage: pruftnet serve [--port 3000] [--host 127.0.0.1] [--data-dir PATH]\n\nOnly loopback addresses are supported. Stop the server with Ctrl+C.`,
    )
    process.exit(0)
}
if (positionals.length !== 1 || positionals[0] !== 'serve') {
    console.error('Unknown command. Use --help for usage.')
    process.exit(1)
}
if (values['data-dir']) process.env.PRUFTNET_DATA_DIR = values['data-dir']
const config = loadServerConfig({
    ...(values.port === undefined ? {} : { port: Number(values.port) }),
    ...(values.host === undefined ? {} : { host: values.host }),
})
if (config.mode === 'production') {
    process.env.PRUFTNET_CAPTURE_WORKER_PATH = fileURLToPath(
        new URL(
            process.platform === 'win32'
                ? './native/pruftnet_capture_worker.exe'
                : './native/pruftnet_capture_worker',
            import.meta.url,
        ),
    )
}

const program = Effect.gen(function* () {
    yield* Effect.log(`Starting server in ${config.mode} mode on port ${config.port}`)
    const server = yield* startServer(config)
    yield* Effect.log(`Listening on ${server.address}`)
    yield* Effect.never.pipe(
        Effect.ensuring(server.close.pipe(Effect.catchAll((error) => Effect.logError(error)))),
    )
})

NodeRuntime.runMain(program)

import { NodeRuntime } from '@effect/platform-node'
import { Effect } from 'effect'

import { loadServerConfig } from './config'
import { startServer } from './server'

const config = loadServerConfig()

const program = Effect.gen(function* () {
    yield* Effect.log(`Starting server in ${config.mode} mode on port ${config.port}`)
    const server = yield* startServer(config)
    yield* Effect.log(`Listening on ${server.address}`)
    yield* Effect.never.pipe(
        Effect.ensuring(server.close.pipe(Effect.catchAll((error) => Effect.logError(error)))),
    )
})

NodeRuntime.runMain(program)

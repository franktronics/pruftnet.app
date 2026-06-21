import { Effect, Layer } from 'effect'
import { NetworkInterfaceRpcs } from '@repo/shared/network-interface'

import { NetworkInterfaceRepositoryLive } from './os-repository.js'
import { NetworkInterfaceRepository } from './repository.js'

export const NetworkInterfaceLive = NetworkInterfaceRpcs.toLayer(
    Effect.gen(function* () {
        const repository = yield* NetworkInterfaceRepository

        return {
            NetworkInterfaces: () => repository.getAll(),
        }
    }),
).pipe(Layer.provide(NetworkInterfaceRepositoryLive))

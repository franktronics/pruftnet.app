import { Effect, Layer } from 'effect'
import { NetworkInterfaceRpcs } from '@repo/shared/network-interface'

import { NetworkInterfaceRepositoryLive } from './os-repository'
import { NetworkInterfaceRepository } from './repository'

export const NetworkInterfaceLive = NetworkInterfaceRpcs.toLayer(
    Effect.gen(function* () {
        const repository = yield* NetworkInterfaceRepository

        return {
            NetworkInterfaces: () => repository.getAll(),
        }
    }),
).pipe(Layer.provide(NetworkInterfaceRepositoryLive))

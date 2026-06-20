import type { NetworkInterfaces } from '@repo/shared/network-interface'
import { InterfacesNotFound } from '@repo/shared/network-interface'
import { Context, Effect } from 'effect'

export class NetworkInterfaceRepository extends Context.Tag('NetworkInterfaceRepository')<
    NetworkInterfaceRepository,
    {
        readonly getAll: () => Effect.Effect<NetworkInterfaces, InterfacesNotFound>
    }
>() {}

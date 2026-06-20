import { Rpc, RpcGroup } from '@effect/rpc'
import { NetworkInterfacesSchema } from './schema'
import { InterfacesNotFound } from './errors'

export class NetworkInterfaceRpcs extends RpcGroup.make(
    Rpc.make('NetworkInterfaces', {
        success: NetworkInterfacesSchema,
        error: InterfacesNotFound,
    }),
) {}

import { Rpc, RpcGroup } from '@effect/rpc'
import { NetworkInterfacesSchema } from './schema.js'
import { InterfacesNotFound } from './errors.js'

export class NetworkInterfaceRpcs extends RpcGroup.make(
    Rpc.make('NetworkInterfaces', {
        success: NetworkInterfacesSchema,
        error: InterfacesNotFound,
    }),
) {}

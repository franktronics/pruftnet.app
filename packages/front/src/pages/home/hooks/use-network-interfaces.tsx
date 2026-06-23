import { RpcClient } from '@effect/rpc'
import { NetworkInterfaceRpcs } from '@repo/shared/network-interface'
import type { InterfacesNotFound, NetworkInterfaces } from '@repo/shared/network-interface'
import { Effect } from 'effect'
import { RpcClientLive } from '../../../config/rpc-client'
import { runEffectPromise } from '../../../utils/run-effect-promise'
import { useQuery } from '@tanstack/react-query'

const niClient = RpcClient.make(NetworkInterfaceRpcs).pipe(Effect.provide(RpcClientLive))

export const useGetNetworkInterfaces = ({ enabled }: { enabled?: boolean } = {}) => {
    const getInterfaces = async () => {
        const program = Effect.gen(function* () {
            const client = yield* niClient
            const nis = yield* client.NetworkInterfaces()
            return nis
        }).pipe(Effect.scoped, Effect.provide(RpcClientLive))

        return await runEffectPromise(program)
    }

    return useQuery<NetworkInterfaces, InterfacesNotFound>({
        enabled: enabled ?? false,
        retry: 2,
        staleTime: 60 * 1000, // 1 minute
        queryFn: getInterfaces,
        queryKey: ['network-interfaces'],
    })
}

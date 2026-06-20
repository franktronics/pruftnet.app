import { Layer } from 'effect'
import { NetworkInterfaceRpcs } from '@repo/shared/network-interface'
import { NetworkInterfaceLive } from './network-interface'

export const AppRpcGroup = NetworkInterfaceRpcs.merge()
export const AppLayer = Layer.mergeAll(NetworkInterfaceLive)

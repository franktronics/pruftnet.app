import { Layer } from 'effect'

import { NetworkInterfaceLive } from './network-interface'

export const AppLayer = Layer.mergeAll(NetworkInterfaceLive)

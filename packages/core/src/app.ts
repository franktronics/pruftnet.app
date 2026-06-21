import { Layer } from 'effect'

import { NetworkInterfaceLive } from './network-interface/index.js'

export const AppLayer = Layer.mergeAll(NetworkInterfaceLive)

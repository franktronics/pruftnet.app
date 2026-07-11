import { Layer } from 'effect'

import { NetworkInterfaceLive } from './network-interface'
import { CaptureLive } from './capture'

export const AppLayer = Layer.mergeAll(NetworkInterfaceLive, CaptureLive)

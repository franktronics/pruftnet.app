import { CaptureRpcs } from './modules/capture'
import { NetworkInterfaceRpcs } from './modules/network-interface'

export const AppRpcGroup = NetworkInterfaceRpcs.merge(CaptureRpcs)

import { CaptureRpcs } from './modules/capture'
import { NetworkInterfaceRpcs } from './modules/network-interface'
import { RealtimeRpcs } from './modules/realtime'

export const AppRpcGroup = NetworkInterfaceRpcs.merge(CaptureRpcs).merge(RealtimeRpcs)

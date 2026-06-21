import { NetworkInterfaceRpcs } from './network-interface/index.js'

export * from './network-interface/index.js'

export const AppRpcGroup = NetworkInterfaceRpcs.merge()

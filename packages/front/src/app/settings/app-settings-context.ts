import { createContext, use } from 'react'

import type { AppSettings, PacketListCacheMode } from './app-settings'

export interface AppSettingsContextValue {
    readonly settings: AppSettings
    readonly packetListCacheMiB: number
    readonly setPacketListCacheMode: (mode: PacketListCacheMode) => void
    readonly setPacketListCacheMaximumMiB: (maximumMiB: number) => void
    readonly resetSettings: () => void
}

export const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined)

export function useAppSettings() {
    const context = use(AppSettingsContext)
    if (!context) throw new Error('useAppSettings must be used within AppSettingsProvider')
    return context
}

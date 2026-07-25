import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
    APP_SETTINGS_STORAGE_KEY,
    defaultAppSettings,
    parseAppSettings,
    resolvedPacketListCacheMiB,
    type AppSettings,
    type PacketListCacheMode,
} from './app-settings'
import { AppSettingsContext, type AppSettingsContextValue } from './app-settings-context'

function initialSettings() {
    if (typeof window === 'undefined') return defaultAppSettings
    return parseAppSettings(window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY))
}

export function AppSettingsProvider({ children }: { readonly children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings>(initialSettings)

    useEffect(() => {
        window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    }, [settings])

    useEffect(() => {
        const receiveSettings = (event: StorageEvent) => {
            if (event.storageArea !== window.localStorage || event.key !== APP_SETTINGS_STORAGE_KEY)
                return
            setSettings(parseAppSettings(event.newValue))
        }
        window.addEventListener('storage', receiveSettings)
        return () => window.removeEventListener('storage', receiveSettings)
    }, [])

    const setPacketListCacheMode = useCallback((mode: PacketListCacheMode) => {
        setSettings((current) => ({
            ...current,
            packetListCache: { ...current.packetListCache, mode },
        }))
    }, [])

    const setPacketListCacheMaximumMiB = useCallback((maximumMiB: number) => {
        setSettings((current) => ({
            ...current,
            packetListCache: { mode: 'manual', maximumMiB },
        }))
    }, [])

    const value = useMemo<AppSettingsContextValue>(
        () => ({
            settings,
            packetListCacheMiB: resolvedPacketListCacheMiB(settings),
            setPacketListCacheMode,
            setPacketListCacheMaximumMiB,
            resetSettings: () => setSettings(defaultAppSettings),
        }),
        [setPacketListCacheMaximumMiB, setPacketListCacheMode, settings],
    )

    return <AppSettingsContext value={value}>{children}</AppSettingsContext>
}

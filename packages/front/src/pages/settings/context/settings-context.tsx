import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { fetcher } from '../../../config/client-trpc'
import { useMutateFetcher, useQueryFetcher, trpcClient, type ClientErrorType } from '@repo/utils'
import type { AppSettings } from '@repo/core-node/types'

const { ClientError } = trpcClient

export type SettingsContextType = {
    appSettings: AppSettings
    setAppSettings: (value: Partial<AppSettings>) => Promise<AppSettings>
    resetAppSettings: () => Promise<AppSettings>
    getSettings: () => Promise<boolean | Error | ClientErrorType>
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export const useSettingsContext = () => {
    const context = useContext(SettingsContext)
    if (context === undefined) {
        throw new Error('useSettingsContext must be used within a SettingsProvider')
    }
    return context
}

type SettingsProviderProps = {} & ComponentPropsWithoutRef<'div'>
export const SettingsProvider = (props: SettingsProviderProps) => {
    const { children, ...rest } = props
    const [settings, setSettings] = useState<AppSettings>(null as any)

    const { mutateData: updateSettings } = useMutateFetcher({
        procedure: fetcher.settings.update.mutate(settings, 'POST'),
        popupOnFetching: {
            fetching: 'Updating settings...',
            success: 'Settings updated successfully.',
        },
        popupOnError: true,
    })
    const { mutateData: resetSettings } = useMutateFetcher({
        procedure: fetcher.settings.reset.mutate({}, 'POST'),
        popupOnFetching: {
            fetching: 'Resetting settings...',
            success: 'Settings reset successfully.',
        },
        popupOnError: true,
    })

    const { fetchData: getSettingsQuery } = useQueryFetcher({
        procedure: fetcher.settings.get.query({}),
        popupOnError: true,
        queryKey: ['settings'],
    })

    const getSettingsQueryRef = useRef(getSettingsQuery)
    getSettingsQueryRef.current = getSettingsQuery

    const handleGetSettings = useCallback(async () => {
        try {
            const result = await getSettingsQueryRef.current()

            if (result?.error) {
                if (result.error instanceof ClientError) {
                    return result.error
                }
                return new Error('Failed to fetch settings')
            }

            if (result?.data) {
                setSettings(result.data)
                return true
            }

            return new Error('Failed to fetch settings')
        } catch (error) {
            return error instanceof Error ? error : new Error('Failed to fetch settings')
        }
    }, [])

    const handleUpdateSettings = async (value: Partial<AppSettings>) => {
        const actual = { ...settings }
        setSettings((prev) => ({ ...prev, ...value }))
        const result = await updateSettings()
        if (!result) {
            setSettings((prev) => ({ ...prev, ...actual }))
            return actual
        }
        return result
    }

    const handleResetSettings = async () => {
        const result = await resetSettings()
        if (!result) return settings
        setSettings((prev) => ({ ...prev, ...result }))
        return result
    }

    const value: SettingsContextType = {
        appSettings: settings,
        getSettings: handleGetSettings,
        setAppSettings: handleUpdateSettings,
        resetAppSettings: handleResetSettings,
    }

    return (
        <SettingsContext.Provider value={value} {...rest}>
            {children}
        </SettingsContext.Provider>
    )
}

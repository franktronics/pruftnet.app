import { createContext, useCallback, useContext, useRef } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { fetcher } from '../../../config/client-trpc'
import {
    useMutateFetcher,
    useQueryFetcher,
    queryClient,
    trpcClient,
    type ClientErrorType,
} from '@repo/utils'
import type { AppSettings } from '@repo/core-node/types'
import { useForm } from '@tanstack/react-form'
import type { SimpleForm } from '../../../utils/generics'
import { settingsSchema } from '@repo/core-node/schema'

const { ClientError } = trpcClient

export type SettingsContextType = {
    appSettings: AppSettings
    form: SimpleForm<AppSettings>
    resetAppSettings: () => Promise<AppSettings>
    getSettings: () => Promise<boolean | Error | ClientErrorType>
    isPending: boolean
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

    const { mutateData: resetSettings, isPending: resetingSettings } = useMutateFetcher({
        procedure: fetcher.settings.reset,
        popupOnFetching: {
            fetching: 'Resetting settings...',
            success: 'Settings reset successfully.',
        },
        popupOnError: true,
    })

    const { mutateData: updateSettings, isPending: updatingSettings } = useMutateFetcher({
        procedure: fetcher.settings.update,
        popupOnFetching: {
            fetching: 'Updating settings...',
            success: 'Settings updated successfully.',
        },
        popupOnError: true,
    })

    const { refetch: getSettingsQuery, data } = useQueryFetcher({
        procedure: fetcher.settings.get.query({}),
        popupOnError: true,
        queryKey: ['settings'],
        staleTime: Infinity,
    })

    const form = useForm({
        defaultValues: { ...data },
        validators: {
            onChange: settingsSchema,
        },
        onSubmit: async (values) => {
            const result = await updateSettings(values.value)
            if (result) {
                await queryClient.invalidateQueries({ queryKey: ['settings'] })
                form.reset(result, { keepDefaultValues: true })
            }
        },
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
                form.reset({ ...result.data })
                return true
            }

            return new Error('Failed to fetch settings')
        } catch (error) {
            return error instanceof Error ? error : new Error('Failed to fetch settings')
        }
    }, [])

    const handleResetSettings = async () => {
        const result = await resetSettings({})
        if (!result) return form.state.values as AppSettings
        await queryClient.invalidateQueries({ queryKey: ['settings'] })
        form.reset(result, { keepDefaultValues: true })
        return result
    }

    const value = {
        appSettings: form.state.values as AppSettings,
        form: form as any,
        getSettings: handleGetSettings,
        resetAppSettings: handleResetSettings,
        isPending: resetingSettings || updatingSettings,
    }

    return (
        <SettingsContext.Provider value={value} {...rest}>
            {children}
        </SettingsContext.Provider>
    )
}

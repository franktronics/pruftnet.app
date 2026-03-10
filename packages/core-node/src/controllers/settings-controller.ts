import { procedure } from '../routes/root'
import { z } from 'zod'
import { trpcServer } from '@repo/utils'
import { settingsSchema, type AppSettings } from '../models/settings-model'
import { SettingsRepository } from '../repository/settings-repository'

const { ServerError } = trpcServer

const partialSettingsSchema = settingsSchema.partial()

export class SettingsController {
    private readonly settingsRepo: SettingsRepository

    constructor() {
        this.settingsRepo = new SettingsRepository()
    }

    private getSettings() {
        return procedure.input(z.object({})).query(async ({ store }): Promise<AppSettings> => {
            try {
                const settings = await this.settingsRepo.getSettings()
                store.settings.set('settings', settings)
                return settings
            } catch (error: any) {
                console.error('Error retrieving settings:', error)
                new ServerError({
                    message: 'Failed to retrieve settings',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    private updateSettings() {
        return procedure
            .input(partialSettingsSchema)
            .mutation(async ({ input, store }): Promise<AppSettings> => {
                try {
                    const updatedSettings = await this.settingsRepo.updateSettings(input)
                    store.settings.set('settings', updatedSettings)
                    return updatedSettings
                } catch (error) {
                    new ServerError({
                        message: 'Failed to update settings',
                        whatToDo: 'Please retry later or contact support.',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private resetSettings() {
        return procedure.input(z.object({})).mutation(async ({ store }): Promise<AppSettings> => {
            try {
                const defaultSettings = await this.settingsRepo.resetSettings()
                store.settings.set('settings', defaultSettings)
                return defaultSettings
            } catch (error) {
                new ServerError({
                    message: 'Failed to reset settings',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    static make() {
        const inst = new SettingsController()

        return {
            get: inst.getSettings(),
            update: inst.updateSettings(),
            reset: inst.resetSettings(),
        }
    }
}

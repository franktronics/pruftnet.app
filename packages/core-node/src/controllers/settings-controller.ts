import { procedure } from '../routes/root'
import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { trpcServer } from '@repo/utils'
import { settingsSchema, type AppSettings } from '../models/settings-models'

const { ServerError } = trpcServer

const partialSettingsSchema = settingsSchema.partial()

export class SettingsController {
    private settingsPath: string
    private defaultSettingsPath: string

    constructor() {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = dirname(__filename)
        this.settingsPath = resolve(__dirname, '../../assets/settings.json')
        this.defaultSettingsPath = resolve(__dirname, '../../assets/settings-default.json')
    }

    private async loadSettingsFromFile(filePath: string): Promise<AppSettings> {
        try {
            const fileContent = await readFile(filePath, 'utf-8')
            const jsonData = JSON.parse(fileContent)
            const validatedSettings = settingsSchema.parse(jsonData)
            return validatedSettings
        } catch (error) {
            if ((error as any)?.code === 'ENOENT') {
                new ServerError({
                    message: `Settings file not found at ${filePath}`,
                    whatToDo: 'Please ensure the settings file exists and is accessible.',
                    code: 404,
                }).throw()
            } else if (error instanceof z.ZodError) {
                new ServerError({
                    message: 'Invalid settings file format',
                    whatToDo: 'Please ensure the settings file contains valid data',
                    code: 400,
                }).throw()
            } else if (error instanceof SyntaxError) {
                new ServerError({
                    message: 'Settings file contains invalid JSON',
                    whatToDo: 'Please ensure the settings file is properly formatted JSON.',
                    code: 400,
                }).throw()
            } else {
                new ServerError({
                    message: 'Failed to load settings file',
                    whatToDo: 'Please check file permissions and try again.',
                    code: 500,
                }).throw()
            }
            throw error
        }
    }

    private async saveSettingsToFile(settings: AppSettings): Promise<void> {
        try {
            const jsonContent = JSON.stringify(settings, null, 4)
            await writeFile(this.settingsPath, jsonContent, 'utf-8')
        } catch (error) {
            new ServerError({
                message: 'Failed to save settings file',
                whatToDo: 'Please check file permissions and try again.',
                code: 500,
            }).throw()
        }
    }

    private getSettings() {
        return procedure.input(z.object({})).query(async ({ store }): Promise<AppSettings> => {
            const settings = await this.loadSettingsFromFile(this.settingsPath)
            store.settings.set('settings', settings)
            return settings
        })
    }

    private updateSettings() {
        return procedure
            .input(partialSettingsSchema)
            .mutation(async ({ input, store }): Promise<AppSettings> => {
                let currentSettings = store.settings.get('settings')

                if (!currentSettings) {
                    currentSettings = await this.loadSettingsFromFile(this.settingsPath)
                }

                const updatedSettings: AppSettings = {
                    ...currentSettings,
                    ...input,
                }

                const validatedSettings = settingsSchema.parse(updatedSettings)

                store.settings.set('settings', validatedSettings)
                await this.saveSettingsToFile(validatedSettings)

                return validatedSettings
            })
    }

    private resetSettings() {
        return procedure.input(z.object({})).mutation(async ({ store }): Promise<AppSettings> => {
            const defaultSettings = await this.loadSettingsFromFile(this.defaultSettingsPath)
            store.settings.set('settings', defaultSettings)
            await this.saveSettingsToFile(defaultSettings)
            return defaultSettings
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

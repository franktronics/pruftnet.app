import { prisma } from '../db-config'
import { settingsSchema, type AppSettings } from '../models/settings-model'

const DEFAULT_SETTINGS: AppSettings = {
    maxPacketBufferSize: 10000,
    promiscuousMode: true,
    protocolEntryFile:
        '/home/wb207/Documents/pruftnet/packages/core-node/assets/protocols/ethernet.json',
    defaultCaptureTab: 'scan',
    connectionLineType: 'straight',
}

export class SettingsRepository {
    private defaultSettings: AppSettings

    constructor() {
        this.defaultSettings = settingsSchema.parse(DEFAULT_SETTINGS)
    }

    private toAppSettings(settings: any): AppSettings {
        return settingsSchema.parse({
            maxPacketBufferSize: settings.maxPacketBufferSize,
            promiscuousMode: settings.promiscuousMode,
            protocolEntryFile: settings.protocolEntryFile,
            defaultCaptureTab: settings.defaultCaptureTab,
            connectionLineType: settings.connectionLineType,
        })
    }

    public async getSettings(): Promise<AppSettings> {
        const existing = await prisma.settings.findFirst()
        if (existing) return this.toAppSettings(existing)

        const created = await prisma.settings.create({ data: this.defaultSettings })
        return this.toAppSettings(created)
    }

    public async updateSettings(partialSettings: Partial<AppSettings>): Promise<AppSettings> {
        const current = await prisma.settings.findFirst()

        let id: number | undefined
        let base: AppSettings

        if (!current) {
            const created = await prisma.settings.create({ data: this.defaultSettings })
            id = created.id
            base = this.defaultSettings
        } else {
            id = current.id
            base = this.toAppSettings(current)
        }

        const merged = settingsSchema.parse({
            ...base,
            ...partialSettings,
        })

        const updated = await prisma.settings.update({
            where: { id: id as number },
            data: merged,
        })

        return this.toAppSettings(updated)
    }

    public async resetSettings(): Promise<AppSettings> {
        const existing = await prisma.settings.findFirst()

        if (!existing) {
            const created = await prisma.settings.create({ data: this.defaultSettings })
            return this.toAppSettings(created)
        }

        const updated = await prisma.settings.update({
            where: { id: existing.id },
            data: this.defaultSettings,
        })

        return this.toAppSettings(updated)
    }
}

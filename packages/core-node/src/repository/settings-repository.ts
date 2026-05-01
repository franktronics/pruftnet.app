import { eq } from 'drizzle-orm'
import { db, isPackaged } from '../db-config'
import { settings, type Settings } from '../db/schema'
import { settingsSchema, type AppSettings } from '../models/settings-model'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const getAssetsPath = () => {
    const resourcesPath = process.env.RESOURCES_PATH
    if (isPackaged && resourcesPath) {
        return join(resourcesPath, 'assets')
    }
    return resolve(__dirname, '../../assets')
}

const DEFAULT_PROTOCOL_ENTRY_FILE = join(getAssetsPath(), 'protocols/ethernet.json')

const DEFAULT_SETTINGS: AppSettings = {
    maxPacketBufferSize: 10000,
    promiscuousMode: true,
    protocolEntryFile: DEFAULT_PROTOCOL_ENTRY_FILE,
    defaultCaptureTab: 'scan',
    connectionLineType: 'straight',
}

function toAppSettings(row: Settings): AppSettings {
    return settingsSchema.parse({
        maxPacketBufferSize: row.maxPacketBufferSize,
        promiscuousMode: row.promiscuousMode,
        protocolEntryFile: row.protocolEntryFile,
        defaultCaptureTab: row.defaultCaptureTab,
        connectionLineType: row.connectionLineType,
    })
}

export class SettingsRepository {
    private defaultSettings: AppSettings

    constructor() {
        this.defaultSettings = settingsSchema.parse(DEFAULT_SETTINGS)
    }

    public async getSettings(): Promise<AppSettings> {
        const existing = db.select().from(settings).limit(1).all()[0]
        if (existing) return toAppSettings(existing)

        const now = new Date().toISOString()
        const [created] = db
            .insert(settings)
            .values({ ...this.defaultSettings, createdAt: now, updatedAt: now })
            .returning()
            .all()
        return toAppSettings(created!)
    }

    public async updateSettings(partialSettings: Partial<AppSettings>): Promise<AppSettings> {
        const current = db.select().from(settings).limit(1).all()[0]
        const now = new Date().toISOString()

        let id: number
        let base: AppSettings

        if (!current) {
            const [created] = db
                .insert(settings)
                .values({ ...this.defaultSettings, createdAt: now, updatedAt: now })
                .returning()
                .all()
            id = created!.id
            base = this.defaultSettings
        } else {
            id = current.id
            base = toAppSettings(current)
        }

        const merged = settingsSchema.parse({ ...base, ...partialSettings })

        const [updated] = db
            .update(settings)
            .set({ ...merged, updatedAt: now })
            .where(eq(settings.id, id))
            .returning()
            .all()

        return toAppSettings(updated!)
    }

    public async resetSettings(): Promise<AppSettings> {
        const existing = db.select().from(settings).limit(1).all()[0]
        const now = new Date().toISOString()

        if (!existing) {
            const [created] = db
                .insert(settings)
                .values({ ...this.defaultSettings, createdAt: now, updatedAt: now })
                .returning()
                .all()
            return toAppSettings(created!)
        }

        const [updated] = db
            .update(settings)
            .set({ ...this.defaultSettings, updatedAt: now })
            .where(eq(settings.id, existing.id))
            .returning()
            .all()

        return toAppSettings(updated!)
    }
}

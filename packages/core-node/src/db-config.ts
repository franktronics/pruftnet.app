import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import * as schema from './db/schema'

export const isPackaged = process.env.IS_PACKAGED === 'true'
export const userDataPath = process.env.USER_DATA_PATH

// Use CORE_NODE_ROOT if defined (Electron dev context), otherwise resolve from import.meta.url
const packageRoot =
    process.env.CORE_NODE_ROOT ||
    (() => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        return path.resolve(__dirname, '..')
    })()

// Load .env from the core-node package (skip if DATABASE_URL already set)
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.join(packageRoot, '.env') })
}

// Database path resolution:
// 1. Production (packaged): userData/pruftnet.db (set by main.ts)
// 2. Development: packageRoot/dev.db
const rawUrl = process.env.DATABASE_URL || `file:${path.join(packageRoot, 'dev.db')}`
const dbPath = rawUrl.replace(/^file:/, '')
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(packageRoot, dbPath)

// Migrations folder:
// In bundled builds the migrator reads SQL files from disk.
// CORE_NODE_ROOT is set in dev; in prod RESOURCES_PATH is set by main.ts.
// Fallback: resolve relative to this file (works in dev with ts-node/vite).
const getMigrationsFolder = (): string => {
    const resourcesPath = process.env.RESOURCES_PATH
    if (isPackaged && resourcesPath) {
        return path.join(resourcesPath, 'db', 'migrations')
    }
    // Dev: relative to packageRoot
    return path.join(packageRoot, 'src', 'db', 'migrations')
}

const sqlite = new Database(resolvedDbPath)
// Enable WAL for better concurrency
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })

// Apply pending migrations on startup
migrate(db, { migrationsFolder: getMigrationsFolder() })

console.log(`✓ DB ready: ${resolvedDbPath}`)

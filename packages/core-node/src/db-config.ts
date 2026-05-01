import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'
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

// Load .env from the core-node package (dev only, skip if DATABASE_URL already set)
// Uses node:fs directly to avoid bundling dotenv (CJS lib with require("fs"))
if (!process.env.DATABASE_URL && !process.env.IS_PACKAGED) {
    const envPath = path.join(packageRoot, '.env')
    if (existsSync(envPath)) {
        const lines = readFileSync(envPath, 'utf8').split('\n')
        for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue
            const idx = trimmed.indexOf('=')
            if (idx === -1) continue
            const key = trimmed.slice(0, idx).trim()
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
            if (key && !process.env[key]) process.env[key] = val
        }
    }
}

// Database path resolution:
// 1. Production (packaged): userData/pruftnet.db (set by main.ts)
// 2. Development: packageRoot/dev.db
const rawUrl = process.env.DATABASE_URL || `file:${path.join(packageRoot, 'dev.db')}`
const dbPath = rawUrl.replace(/^file:/, '')
const resolvedDbPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(packageRoot, dbPath)

// Migrations inlined — no filesystem access needed at runtime.
// Add new migrations as additional entries to this array.
// Each entry runs once, tracked in __migrations table.
const MIGRATIONS: { name: string; sql: string }[] = [
    {
        name: '0000_init',
        sql: `
CREATE TABLE IF NOT EXISTS \`Image\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`path\` text NOT NULL,
    \`createdAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    \`updatedAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`Image_path_unique\` ON \`Image\` (\`path\`);
CREATE TABLE IF NOT EXISTS \`Analysis\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`title\` text NOT NULL,
    \`description\` text NOT NULL,
    \`data\` text NOT NULL,
    \`imageId\` integer,
    \`createdAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    \`updatedAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (\`imageId\`) REFERENCES \`Image\`(\`id\`) ON UPDATE no action ON DELETE set null
);
CREATE TABLE IF NOT EXISTS \`Log\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`level\` text NOT NULL,
    \`source\` text NOT NULL,
    \`title\` text NOT NULL,
    \`message\` text NOT NULL,
    \`context\` text,
    \`createdAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS \`Settings\` (
    \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    \`maxPacketBufferSize\` integer NOT NULL,
    \`promiscuousMode\` integer NOT NULL,
    \`protocolEntryFile\` text NOT NULL,
    \`defaultCaptureTab\` text NOT NULL,
    \`connectionLineType\` text NOT NULL,
    \`createdAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    \`updatedAt\` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);`,
    },
]

function runMigrations(sqlite: InstanceType<typeof Database>): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS __migrations (
            name TEXT PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)

    const applied = new Set<string>(
        (sqlite.prepare('SELECT name FROM __migrations').all() as { name: string }[]).map(
            (r) => r.name,
        ),
    )

    const insert = sqlite.prepare(
        `INSERT INTO __migrations (name, applied_at) VALUES (?, datetime('now'))`,
    )

    for (const migration of MIGRATIONS) {
        if (applied.has(migration.name)) continue
        sqlite.exec(migration.sql)
        insert.run(migration.name)
        console.log(`✓ Migration applied: ${migration.name}`)
    }
}

const sqlite = new Database(resolvedDbPath)
sqlite.pragma('journal_mode = WAL')

runMigrations(sqlite)

export const db = drizzle(sqlite, { schema })

console.log(`✓ DB ready: ${resolvedDbPath}`)

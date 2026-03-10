import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

// Use CORE_NODE_ROOT if defined (Electron bundled context), otherwise resolve from import.meta.url
const packageRoot =
    process.env.CORE_NODE_ROOT ||
    (() => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        return path.resolve(__dirname, '..')
    })()

// Load .env from the core-node package (skip if DATABASE_URL already set via Vite define)
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.join(packageRoot, '.env') })
}

const connectionString = process.env.DATABASE_URL || 'file:./dev.db'

// Resolve relative SQLite paths from the core-node package root
// If the path is already absolute (starts with /), use it directly
const dbPath = connectionString.replace('file:', '')
const resolvedUrl = connectionString.startsWith('file:')
    ? `file:${path.isAbsolute(dbPath) ? dbPath : path.resolve(packageRoot, dbPath)}`
    : connectionString

const adapter = new PrismaBetterSqlite3({ url: resolvedUrl })
const prisma = new PrismaClient({ adapter })

export { prisma }

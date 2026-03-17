import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const isPackaged = process.env.IS_PACKAGED === 'true'
const userDataPath = process.env.USER_DATA_PATH

// Use CORE_NODE_ROOT if defined (Electron dev context), otherwise resolve from import.meta.url
const packageRoot =
    process.env.CORE_NODE_ROOT ||
    (() => {
        const __filename = fileURLToPath(import.meta.url)
        const __dirname = path.dirname(__filename)
        return path.resolve(__dirname, '..')
    })()

// Load .env from the core-node package (skip if DATABASE_URL already set via Vite define or main.ts)
if (!process.env.DATABASE_URL) {
    dotenv.config({ path: path.join(packageRoot, '.env') })
}

// Database URL resolution:
// 1. Production (packaged): use DATABASE_URL set by main.ts (userData/pruftnet.db)
// 2. Development: use DATABASE_URL from env or default to ./dev.db
const connectionString = process.env.DATABASE_URL || 'file:./dev.db'

// Resolve relative SQLite paths from the appropriate root
// Production: DATABASE_URL is already absolute (set by main.ts)
// Development: resolve relative to packageRoot
const dbPath = connectionString.replace('file:', '')
const resolvedUrl = connectionString.startsWith('file:')
    ? `file:${path.isAbsolute(dbPath) ? dbPath : path.resolve(packageRoot, dbPath)}`
    : connectionString

const adapter = new PrismaBetterSqlite3({ url: resolvedUrl })
const prisma = new PrismaClient({ adapter })

export { prisma, isPackaged, userDataPath }

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '../generated/prisma/client'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, '..')

// Load .env from the core-node package to avoid cwd issues
dotenv.config({ path: path.join(packageRoot, '.env') })

const connectionString = process.env.DATABASE_URL || 'file:./dev.db'

// Resolve relative SQLite paths from the core-node package root
const resolvedUrl = connectionString.startsWith('file:')
    ? `file:${path.resolve(packageRoot, connectionString.replace('file:', ''))}`
    : connectionString

const adapter = new PrismaBetterSqlite3({ url: resolvedUrl })
const prisma = new PrismaClient({ adapter })

export { prisma }

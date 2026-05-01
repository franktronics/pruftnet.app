import { int, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const analysis = sqliteTable('Analysis', {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    data: text('data', { mode: 'json' }).notNull(),
    imageId: integer('imageId').references(() => image.id, { onDelete: 'set null' }),
    createdAt: text('createdAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
})

export const settings = sqliteTable('Settings', {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    maxPacketBufferSize: integer('maxPacketBufferSize').notNull(),
    promiscuousMode: int('promiscuousMode', { mode: 'boolean' }).notNull(),
    protocolEntryFile: text('protocolEntryFile').notNull(),
    defaultCaptureTab: text('defaultCaptureTab').notNull(),
    connectionLineType: text('connectionLineType').notNull(),
    createdAt: text('createdAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
})

export const log = sqliteTable('Log', {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    level: text('level').notNull(),
    source: text('source').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    context: text('context', { mode: 'json' }),
    createdAt: text('createdAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
})

export const image = sqliteTable('Image', {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    path: text('path').notNull().unique(),
    createdAt: text('createdAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updatedAt')
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
})

export type Analysis = typeof analysis.$inferSelect
export type NewAnalysis = typeof analysis.$inferInsert
export type Settings = typeof settings.$inferSelect
export type NewSettings = typeof settings.$inferInsert
export type Log = typeof log.$inferSelect
export type NewLog = typeof log.$inferInsert
export type Image = typeof image.$inferSelect
export type NewImage = typeof image.$inferInsert

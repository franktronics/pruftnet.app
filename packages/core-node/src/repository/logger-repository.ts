import { eq, desc, and } from 'drizzle-orm'
import { db } from '../db-config'
import { log, type Log, type NewLog } from '../db/schema'
import type { LogInput, LogFilter } from '../models/logger-model'

export class LoggerRepository {
    public async createLog(input: LogInput): Promise<Log> {
        const now = new Date().toISOString()
        const [created] = db
            .insert(log)
            .values({
                level: input.level,
                source: input.source,
                title: input.title,
                message: input.message,
                context: input.context !== undefined ? (input.context as NewLog['context']) : null,
                createdAt: now,
            })
            .returning()
            .all()
        return created!
    }

    public async listLogs(filter: LogFilter = {}): Promise<Log[]> {
        const conditions = []
        if (filter.level) conditions.push(eq(log.level, filter.level))
        if (filter.source) conditions.push(eq(log.source, filter.source))

        const whereClause = conditions.length === 0 ? undefined
            : conditions.length === 1 ? conditions[0]
            : and(...conditions)

        return db
            .select()
            .from(log)
            .where(whereClause)
            .orderBy(desc(log.createdAt))
            .limit(filter.take ?? 100)
            .offset(filter.skip ?? 0)
            .all()
    }

    public async clearLogs(): Promise<{ success: boolean }> {
        db.delete(log).run()
        return { success: true }
    }
}

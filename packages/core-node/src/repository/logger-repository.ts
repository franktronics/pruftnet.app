import { prisma } from '../db-config'
import type { LogInput, LogFilter } from '../models/logger-model'
import { Prisma } from '../../generated/prisma/client'

export class LoggerRepository {
    public async createLog(input: LogInput) {
        const { context, ...rest } = input
        return prisma.log.create({
            data: {
                ...rest,
                ...(context !== undefined ? { context: context as Prisma.InputJsonValue } : {}),
            },
        })
    }

    public async listLogs(filter: LogFilter = {}) {
        const where: any = {}
        if (filter.level) where.level = filter.level
        if (filter.source) where.source = filter.source

        return prisma.log.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: filter.take ?? 100,
            skip: filter.skip ?? 0,
        })
    }

    public async clearLogs() {
        await prisma.log.deleteMany({})
        return { success: true }
    }
}

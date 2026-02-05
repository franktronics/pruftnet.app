import { procedure } from '../routes/root'
import { z } from 'zod'
import { trpcServer } from '@repo/utils'
import { logFilterSchema, logInputSchema, type LogInput } from '../models/logger-model'
import { LoggerService } from '../services/logger-service'

const { ServerError } = trpcServer

export class LoggerController {
    private readonly service: LoggerService

    constructor() {
        this.service = new LoggerService()
    }

    private createLog() {
        return procedure.input(logInputSchema).mutation(async ({ input }): Promise<any> => {
            try {
                return await this.service.log(input as LogInput)
            } catch (error) {
                new ServerError({
                    message: 'Failed to write log',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    private listLogs() {
        return procedure.input(logFilterSchema.partial()).query(async ({ input }) => {
            try {
                return await this.service.list(input)
            } catch (error) {
                new ServerError({
                    message: 'Failed to list logs',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    private clearLogs() {
        return procedure.input(z.object({})).mutation(async () => {
            try {
                return await this.service.clearAll()
            } catch (error) {
                new ServerError({
                    message: 'Failed to clear logs',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    static make() {
        const inst = new LoggerController()
        return {
            create: inst.createLog(),
            list: inst.listLogs(),
            clear: inst.clearLogs(),
        }
    }
}

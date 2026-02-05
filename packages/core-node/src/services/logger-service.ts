import type { LogFilter, LogInput } from '../models/logger-model'
import { LoggerRepository } from '../repository/logger-repository'

export class LoggerService {
    private readonly repo: LoggerRepository

    constructor() {
        this.repo = new LoggerRepository()
    }

    public async log(input: LogInput) {
        return this.repo.createLog(input)
    }

    public async list(filter: LogFilter = {}) {
        return this.repo.listLogs(filter)
    }

    public async clearAll() {
        return this.repo.clearLogs()
    }
}

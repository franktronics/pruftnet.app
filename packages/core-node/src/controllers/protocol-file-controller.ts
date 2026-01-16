import { procedure } from '../routes/root.js'
import { ProtocolFileLoaderService } from '../services/protocol-file-loader-service.js'
import { z } from 'zod'

export class ProtocolFileController {
    private loaderService: ProtocolFileLoaderService

    constructor() {
        this.loaderService = new ProtocolFileLoaderService()
    }

    private getProtocolFileById() {
        return procedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
            const protocolFile = await this.loaderService.loadProtocolFileById(input.id)
            return protocolFile
        })
    }

    private getProtocolFileByPath() {
        return procedure.input(z.object({ path: z.string() })).query(async ({ input }) => {
            const protocolFile = await this.loaderService.loadProtocolFileByPath(input.path)
            return protocolFile
        })
    }

    static make() {
        const inst = new ProtocolFileController()

        return {
            getById: inst.getProtocolFileById(),
            getByPath: inst.getProtocolFileByPath(),
        }
    }
}

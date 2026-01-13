import { procedure } from '../routes/root.js'
import { ProtocolFileLoaderService } from '../services/protocol-file-loader-service.js'
import { z } from 'zod'

export class ProtocolFileController {
    private loaderService: ProtocolFileLoaderService

    constructor() {
        this.loaderService = new ProtocolFileLoaderService()
    }

    private getProtocolFile() {
        return procedure
            .input(
                z
                    .object({ path: z.string().optional(), id: z.number().optional() })
                    .refine((data) => data.path !== undefined || data.id !== undefined, {
                        message: 'Either path or id must be provided',
                    }),
            )
            .query(async ({ input }) => {
                if (input.path) {
                    const protocolFile = await this.loaderService.loadProtocolFileByPath(input.path)
                    return protocolFile
                } else if (input.id !== undefined) {
                    const protocolFile = await this.loaderService.loadProtocolFileById(input.id)
                    return protocolFile
                }
                return undefined
            })
    }

    static make() {
        const inst = new ProtocolFileController()

        return {
            get: inst.getProtocolFile(),
        }
    }
}

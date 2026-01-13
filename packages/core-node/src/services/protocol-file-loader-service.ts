import { stores } from '../routes/root.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'

const headerFieldSchema = z.object({
    description: z.string(),
})

export const protocolFileSchema = z.object({
    name: z.string(),
    header: z.record(z.string(), headerFieldSchema),
    next_protocol: z
        .object({
            selector: z.string(),
            start_after: z.string(),
            mappings: z.record(
                z.string(),
                z.object({
                    file: z.string(),
                }),
            ),
        })
        .optional(),
})

export type ProtocolFile = z.infer<typeof protocolFileSchema>

export class ProtocolFileLoaderService {
    constructor() {}

    private async loadProtocolFile(path: string): Promise<ProtocolFile> {
        try {
            const fileContent = await readFile(path, 'utf-8')
            const jsonData = JSON.parse(fileContent)
            const validatedProtocol = protocolFileSchema.parse(jsonData)
            return validatedProtocol
        } catch (error) {
            if (error instanceof z.ZodError) {
                throw new Error(`Invalid protocol file format: ${error.message}`)
            } else if (error instanceof SyntaxError) {
                throw new Error(`Protocol file contains invalid JSON: ${error.message}`)
            }
            throw error
        }
    }

    public async loadProtocolFileById(id: number): Promise<ProtocolFile | undefined> {
        const protocolFile = stores.protocolFiles.getByIndex(id)
        return protocolFile
    }

    public async loadProtocolFileByPath(path: string): Promise<ProtocolFile | undefined> {
        if (stores.protocolFiles.has(path)) {
            return stores.protocolFiles.get(path)!
        }

        try {
            const protocolFile = await this.loadProtocolFile(path)
            stores.protocolFiles.set(path, protocolFile)
            return protocolFile
        } catch (error) {
            if ((error as any)?.code === 'ENOENT') {
                return undefined
            }
            throw error
        }
    }
}

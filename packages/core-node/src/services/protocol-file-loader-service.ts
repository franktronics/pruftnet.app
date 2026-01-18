import { stores } from '../routes/root.js'
import { z } from 'zod'
import { readFile } from 'node:fs/promises'

const headerFieldSchema = z.object({
    description: z.string(),
    type: z.enum(['mac', 'ipv4', 'ipv6', 'int', 'hex', 'timestamp', 'bytes']),
})

export const protocolFileSchema = z.object({
    name: z.string(),
    description: z.string(),
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
export type ProtocolFileData = {
    id: number
    path: string
    content: ProtocolFile
}

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

    public async loadProtocolFileById(id: number): Promise<ProtocolFileData | undefined> {
        const protocolFile = stores.protocolFiles.getByIndex(id)
        if (protocolFile) {
            const path = stores.protocolFiles.getKeyByIndex(id)!
            return {
                content: protocolFile,
                path: path,
                id: id,
            }
        }
        return undefined
    }

    public async loadProtocolFileByPath(path: string): Promise<ProtocolFileData | undefined> {
        if (stores.protocolFiles.has(path)) {
            return {
                content: stores.protocolFiles.get(path)!,
                path: path,
                id: stores.protocolFiles.getIndexByKey(path)!,
            }
        }

        try {
            const protocolFile = await this.loadProtocolFile(path)
            stores.protocolFiles.set(path, protocolFile)
            return {
                content: protocolFile,
                path: path,
                id: stores.protocolFiles.getIndexByKey(path)!,
            }
        } catch (error) {
            if ((error as any)?.code === 'ENOENT') {
                return undefined
            }
            throw error
        }
    }
}

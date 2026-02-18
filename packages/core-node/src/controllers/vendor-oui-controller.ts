import { z } from 'zod'
import { procedure } from '../routes/root'
import ouiData from 'oui-data' with { type: 'json' }

export type VendorOuiData = { vendor: string | null; mac: string }
export class VendorOUIController {
    constructor() {}

    static make() {
        return {
            get: procedure
                .input(
                    z.object({
                        mac: z.string().regex(/^([0-9A-Fa-f]{2}[:\-]){2}([0-9A-Fa-f]{2})/),
                    }),
                )
                .query(async ({ input }): Promise<VendorOuiData> => {
                    const { mac } = input
                    const normalized = mac
                        .toUpperCase()
                        .replace(/[^A-F0-9]/g, '')
                        .slice(0, 6)
                    const vendor = (ouiData as Record<string, string>)[normalized] ?? null
                    if (!vendor) {
                        return { vendor: null, mac }
                    }
                    return { vendor, mac }
                }),
        }
    }
}

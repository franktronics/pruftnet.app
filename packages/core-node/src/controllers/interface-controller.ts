import os, { type NetworkInterfaceInfo } from 'os'
import { trpcServer } from '@repo/utils'
import { z } from 'zod'
const { createProcedure, ServerError } = trpcServer

const procedure = createProcedure()

export class InterfaceController {
    constructor() {}

    static make() {
        return {
            list: procedure.input(z.object({})).query(async () => {
                const nis: Record<string, NetworkInterfaceInfo[] | undefined> =
                    os.networkInterfaces()
                if (!nis) {
                    new ServerError({
                        message: 'No network interfaces found',
                        whatToDo: 'Please ensure that your system has active network interfaces.',
                        code: 404,
                    }).throw()
                }
                return nis
            }),
        }
    }
}

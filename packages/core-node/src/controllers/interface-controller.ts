import os, { type NetworkInterfaceInfo } from 'os'
import { z } from 'zod'
import { procedure } from '../routes/root'
import { trpcServer } from '@repo/utils'

const { ServerError } = trpcServer

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

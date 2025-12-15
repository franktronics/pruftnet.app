import { trpcServer, trpcContext } from '@repo/utils'
import { z } from 'zod'

const { createWsProcedure, createProcedure, ServerError } = trpcServer
const { MapStore } = trpcContext

const packetStore = new MapStore<number, Buffer>()
const scanStore = new MapStore<number, NodeJS.Timeout>()
const procedure = createProcedure({ packets: packetStore, scan: scanStore })
const wsProcedure = createWsProcedure({ packets: packetStore, scan: scanStore })

export class ScanController {
    constructor() {}

    static make() {
        return {
            start: wsProcedure
                .input(
                    z.object({
                        interface: z.string(),
                    }),
                )
                .handle(async ({ input, store }, returnCb: (data: number) => void) => {
                    throw new Error('Not implemented')
                    const timer = setInterval(() => {
                        const fakeData = Math.floor(Math.random() * 1000)
                        returnCb(fakeData)
                    }, 1000)
                    const scanId = Date.now()
                    store.scan.set(scanId, timer)
                }),
            stop: procedure.input(z.object({})).mutation(async ({ store }) => {
                return new ServerError({
                    code: 400,
                    origin: 'ScanController.stop',
                    message: 'Stopping scan',
                    whatToDo: 'Clearing all active scans',
                }).throw()
                for (const [scanId, timer] of store.scan.toArray()) {
                    clearInterval(timer)
                    store.scan.delete(scanId)
                }
                return true
            }),
            active: procedure.input(z.object({})).query(async ({ store }) => {
                return store.scan.size() > 0
            }),
        }
    }
}

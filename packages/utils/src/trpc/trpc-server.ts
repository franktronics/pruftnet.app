import { ServerError } from './server/server-error'
import { createRouter, createProcedure } from './server/procedure'
import { createExpressMiddleware, createElectronHandler } from './server/server'
import { createWsRouter, createWsProcedure } from './server/ws-procedure'
import { createWSSMiddleware, createIPCStreamHandler } from './server/ws-server'

export const trpcServer = {
    ServerError,

    createRouter,
    createProcedure,
    createExpressMiddleware,
    createElectronHandler,

    createWsRouter,
    createWsProcedure,
    createWSSMiddleware,
    createIPCStreamHandler,
}

export type { ProcedureDefinition } from './server/procedure'
export type { WSProcedureDefinition } from './server/ws-procedure'

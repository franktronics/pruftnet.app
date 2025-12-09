import { ServerError } from './server/server-error'
import { createRouter, procedure } from './server/procedure'
import { createExpressMiddleware, createElectronHandler } from './server/server'
import { createWsRouter, wsProcedure } from './server/ws-procedure'
import { createWSSMiddleware, createIPCStreamHandler } from './server/ws-server'

export const trpcServer = {
    ServerError,

    createRouter,
    procedure,
    createExpressMiddleware,
    createElectronHandler,

    createWsRouter,
    wsProcedure,
    createWSSMiddleware,
    createIPCStreamHandler,
}

export type { ProcedureDefinition } from './server/procedure'
export type { WSProcedureDefinition } from './server/ws-procedure'

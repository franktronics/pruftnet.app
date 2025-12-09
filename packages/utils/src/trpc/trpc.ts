import { createClient } from './client'
import { ClientError, ServerError, ErrorType } from './error-parser'
import { createRouter, procedure } from './procedure'
import { createExpressMiddleware, createElectronHandler } from './server'
import { createWsClient } from './ws-client'
import { createWsRouter, wsProcedure } from './ws-procedure'
import { createWSSMiddleware } from './ws-server'

export const trpc = {
    createRouter,
    procedure,
    createClient,
    createExpressMiddleware,
    createElectronHandler,
    ServerError,
    ClientError,
    ErrorType,

    createWsRouter,
    wsProcedure,
    createWsClient,
    createWSSMiddleware,
}

export type { RouterDef, ProcedureDefinition, ProcedureType } from './procedure'
export type { WSRouterDef, WSProcedureDefinition } from './ws-procedure'

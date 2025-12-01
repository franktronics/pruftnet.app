import { createClient } from './client'
import { ClientError, ServerError } from './error-parser'
import { createRouter, procedure } from './procedure'
import { createExpressMiddleware, createElectronHandler } from './server'

export const trpc = {
    createRouter,
    procedure,
    createClient,
    createExpressMiddleware,
    createElectronHandler,
    ServerError,
    ClientError,
}

export type { RouterDef, ProcedureDefinition, ProcedureType } from './procedure'

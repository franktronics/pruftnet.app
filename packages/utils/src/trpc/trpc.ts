export type { RouterDef, ProcedureDefinition, ProcedureType } from './procedure'
import { createClient } from './client'
import { createRouter, procedure } from './procedure'
import { createExpressMiddleware, createElectronHandler } from './server'

export const trpc = {
    createRouter,
    procedure,
    createClient,
    createExpressMiddleware,
    createElectronHandler,
}

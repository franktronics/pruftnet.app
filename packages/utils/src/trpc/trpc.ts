export type { RouterDef, ProcedureDefinition, ProcedureType } from './procedure'
import { createClient } from './client'
import { createRouter, procedure } from './procedure'
import { createExpressMiddleware } from './server'

export const trpc = {
    createRouter,
    procedure,
    createExpressMiddleware,
    createClient,
}

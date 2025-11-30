import { ProcedureDefinition, RouterDef } from './procedure'
import type { RequestHandler, Request, Response } from 'express'
import { type IpcMainInvokeEvent } from 'electron'

/*
 * Creates an Express middleware for the given tRPC router.
 *
 * @param router - The tRPC router definition.
 * @returns An Express middleware function.
 */
export function createExpressMiddleware<T extends RouterDef>(router: T): RequestHandler {
    return async (req: Request, res: Response) => {
        try {
            const procedure = req.params.procedure
            if (!procedure) {
                res.status(400).json({ error: 'Procedure name is required' })
                return
            }

            const procedurePath = procedure.split('.')
            let current: any = router
            for (const segment of procedurePath) {
                if (!current[segment]) {
                    res.status(404).json({ error: 'Procedure not found' })
                    return
                }
                current = current[segment]
            }

            const procDef: ProcedureDefinition<any, any> = current
            let inputData = req.method === 'GET' ? req.query.input : req.body

            if (typeof inputData === 'string') {
                try {
                    inputData = JSON.parse(inputData)
                } catch {
                    // Keep inputData as string if not JSON
                }
            }

            if (procDef.input) {
                const validation = procDef.input.safeParse(inputData)
                if (!validation.success) {
                    return res.status(400).json({
                        error: 'Invalid input',
                        message: validation.error.message,
                    })
                }
                inputData = validation.data
            }

            const result = await procDef.handler(inputData, { req, res })
            res.json({ result })
        } catch (err: any) {
            res.status(500).json({ error: 'Internal Server Error', message: err.message })
        }
    }
}

type ElectronHandlerType = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
export function createElectronHandler<T extends RouterDef>(router: T): ElectronHandlerType {
    return async (event: IpcMainInvokeEvent, data: any) => {
        console.log('handler', { event, data })
        try {
            const procedure = data.procedureName
            if (!procedure) {
                return { error: 'Procedure name is required' }
            }

            const procedurePath = procedure.split('.')
            let current: any = router
            for (const segment of procedurePath) {
                if (!current[segment]) {
                    return { error: 'Procedure not found' }
                }
                current = current[segment]
            }

            const procDef: ProcedureDefinition<any, any> = current
            let inputData = data.input

            if (procDef.input) {
                const validation = procDef.input.safeParse(inputData)
                if (!validation.success) {
                    return {
                        error: 'Invalid input',
                        message: validation.error.message,
                    }
                }
                inputData = validation.data
            }

            const result = await procDef.handler(inputData, { event })
            return { result }
        } catch (err: any) {
            return { error: 'Internal Server Error', message: err.message }
        }
    }
}

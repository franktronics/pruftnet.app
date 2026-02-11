import type { ProcedureDefinition, RouterDef } from './procedure'
import type { RequestHandler, Request, Response } from 'express'
import { type IpcMainInvokeEvent } from 'electron'
import { ErrorType } from '../trpc-types'
import { ServerError } from './server-error'

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
                return new ServerError({
                    code: 400,
                    origin: 'createExpressMiddleware',
                    message: 'Procedure name is required',
                }).http()
            }

            const procedurePath = (procedure as string).split('.')
            let current: any = router
            for (const segment of procedurePath) {
                if (!current[segment]) {
                    return new ServerError({
                        code: 404,
                        origin: 'createExpressMiddleware',
                        message: 'Procedure not found',
                    }).http()
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
                    return new ServerError({
                        code: 400,
                        origin: 'createExpressMiddleware',
                        message: 'Invalid input',
                        whatToDo: 'Ensure the input data matches the expected schema.',
                        data: validation.error.format(),
                    }).http()
                }
                inputData = validation.data
            }

            const result = await procDef.handler(inputData)
            res.json({ result })
        } catch (err: any) {
            return res.status(Math.min(err.cause?.code || 500, 500)).json({
                error: {
                    code: err.cause?.code || 500,
                    type: ErrorType.HTTP_ERROR,
                    message: err?.message || 'Internal Server Error',
                    origin: 'createExpressMiddleware',
                    whatToDo:
                        err.cause?.whatToDo ||
                        'Try again later or contact support if the issue persists.',
                    data: err.cause?.data || undefined,
                },
            })
        }
    }
}

/*
 * Creates an Electron IPC handler for the given tRPC router.
 *
 * @param router - The tRPC router definition.
 * @returns An Electron IPC handler function.
 */
type ElectronHandlerType = (event: IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
export function createElectronHandler<T extends RouterDef>(router: T): ElectronHandlerType {
    return async (_, data: any) => {
        try {
            const procedure = data.procedureName
            if (!procedure) {
                return new ServerError({
                    code: 400,
                    origin: 'createElectronHandler',
                    message: 'Procedure name is required',
                }).ipc()
            }

            const procedurePath = procedure.split('.')
            let current: any = router
            for (const segment of procedurePath) {
                if (!current[segment]) {
                    return new ServerError({
                        code: 404,
                        origin: 'createElectronHandler',
                        message: 'Procedure not found',
                    }).ipc()
                }
                current = current[segment]
            }

            const procDef: ProcedureDefinition<any, any> = current
            let inputData = data.input

            if (procDef.input) {
                const validation = procDef.input.safeParse(inputData)
                if (!validation.success) {
                    return new ServerError({
                        code: 400,
                        origin: 'createElectronHandler',
                        message: 'Invalid input',
                        whatToDo: 'Ensure the input data matches the expected schema.',
                        data: validation.error.format(),
                    }).ipc()
                }
                inputData = validation.data
            }

            const result = await procDef.handler(inputData)
            return { result }
        } catch (err: any) {
            return new ServerError({
                code: err.cause?.code || 500,
                message: err?.message || 'Internal Server Error',
                origin: 'createElectronHandler',
                whatToDo:
                    err.cause?.whatToDo ||
                    'Try again later or contact support if the issue persists.',
                data: err.cause?.data || undefined,
            }).ipc()
        }
    }
}

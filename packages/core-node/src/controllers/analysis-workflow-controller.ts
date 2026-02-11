import { AnalysisRepository } from '../repository/analysis-repository'
import { z } from 'zod'
import { wsProcedure } from '../routes/root'
import { ServerError } from '../../../utils/src/trpc/server/server-error'
import { prepareGraph, ReactFlowGraph } from '../utils'

export class AnalysisWorkflowController {
    private readonly analysisRepo: AnalysisRepository
    constructor() {
        this.analysisRepo = new AnalysisRepository()
    }

    private startWorkflow() {
        return wsProcedure
            .input(
                z.object({
                    interface: z.string().nonempty(),
                    analysisId: z.number().int().positive(),
                }),
            )
            .handle(async ({ input, store }, returnCb: (data: any) => void) => {
                const analysis = await this.analysisRepo.getAnalysisById(input.analysisId)
                if (!analysis || !analysis.data) {
                    new ServerError({
                        message: 'Analysis not found',
                        whatToDo: 'Ensure you provided a valid analysis Id',
                        code: 404,
                    }).throw()
                    return
                }
                const analysisData = analysis.data as any as ReactFlowGraph
                const dag = prepareGraph(analysisData)

                console.log('DAG built', dag)
                returnCb({ analysisData, dag })
            })
    }

    static make() {
        const inst = new AnalysisWorkflowController()

        return {
            start: inst.startWorkflow(),
        }
    }
}

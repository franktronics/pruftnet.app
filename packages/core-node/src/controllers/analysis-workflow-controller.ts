import { AnalysisRepository } from '../repository/analysis-repository'
import { z } from 'zod'
import { wsProcedure } from '../routes/root'
import { ServerError } from '../../../utils/src/trpc/server/server-error'
import {
    prepareGraph,
    ReactFlowGraph,
    WorkflowEventFactory,
    WorkflowOrchestrator,
    type WorkflowEventCallback,
} from '../utils'
import { WorkflowStepFactoryImpl } from '../utils/analysis-workflow/factory/workflow-step-factory'

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
            .handle(async ({ input, store }, returnCb: WorkflowEventCallback) => {
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
                const orchestrator = new WorkflowOrchestrator()
                orchestrator.setStepFactory(WorkflowStepFactoryImpl.make())

                returnCb(
                    WorkflowEventFactory.create({
                        type: 'workflow-start',
                    }),
                )
                await orchestrator.run(
                    dag,
                    analysisData.nodes,
                    analysisData.edges,
                    { interface: input.interface },
                    returnCb,
                )
            })
    }

    static make() {
        const inst = new AnalysisWorkflowController()

        return {
            start: inst.startWorkflow(),
        }
    }
}

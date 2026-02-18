import { trpcServer } from '@repo/utils'
import { ScanController } from '../controllers/scan-controller'
import { AnalysisWorkflowController } from '../controllers/analysis-workflow-controller'

const { createWsRouter } = trpcServer

export const appWsRouter = createWsRouter({
    scan: {
        start: ScanController.make().start,
    },
    analysis: {
        startWorkflow: AnalysisWorkflowController.make().start,
    },
})

export type AppWsRouter = typeof appWsRouter

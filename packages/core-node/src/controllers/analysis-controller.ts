import { z } from 'zod'
import { procedure } from '../routes/root'
import { Edge, Node, ReactFlowJsonObject, trpcServer } from '@repo/utils'

const { ServerError } = trpcServer

export type AnalysisType = {
    id: string
    name: string
    description: string
    createdAt: Date
    updatedAt: Date
    data: ReactFlowJsonObject<Node, Edge>
}

export class AnalysisController {
    constructor() {}

    private createAnalysis() {
        return procedure
            .input(
                z.object({
                    name: z.string().min(5),
                    description: z.string().min(10),
                }),
            )
            .mutation(async ({ input }): Promise<AnalysisType> => {
                // Placeholder logic for creating an analysis
            })
    }

    private storeAnalysis() {
        return procedure
            .input(
                z.object({
                    analysisId: z.string(),
                    data: z.object(),
                }),
            )
            .mutation(async ({ input }) => {
                // Placeholder logic for storing analysis data
            })
    }

    private getAnalysisById() {
        return procedure
            .input(
                z.object({
                    analysisId: z.string(),
                }),
            )
            .query(async ({ input }): Promise<AnalysisType> => {
                // Placeholder logic for retrieving analysis by ID
            })
    }

    private deleteAnalysis() {
        return procedure
            .input(
                z.object({
                    analysisId: z.string(),
                }),
            )
            .mutation(async ({ input }) => {
                // Placeholder logic for deleting an analysis
            })
    }

    private listAnalyses() {
        return procedure.input(z.object({})).query(async (): Promise<AnalysisType[]> => {
            // Placeholder logic for listing all analyses
        })
    }

    static make() {
        const inst = new AnalysisController()
        return {
            create: inst.createAnalysis,
            store: inst.storeAnalysis,
            get: inst.getAnalysisById,
            delete: inst.deleteAnalysis,
            list: inst.listAnalyses,
        }
    }
}

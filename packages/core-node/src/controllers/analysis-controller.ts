import { z } from 'zod'
import { procedure } from '../routes/root'
import { trpcServer } from '@repo/utils'
import { AnalysisRepository } from '../repository/analysis-repository'
import { Prisma, type Analysis } from '../../generated/prisma/client'

const { ServerError } = trpcServer

export class AnalysisController {
    private readonly analysisRepo: AnalysisRepository

    constructor() {
        this.analysisRepo = new AnalysisRepository()
    }

    private createAnalysis() {
        return procedure
            .input(
                z.object({
                    title: z.string().min(1),
                    description: z.string().min(1),
                    data: z.unknown(),
                }),
            )
            .mutation(async ({ input }): Promise<Analysis> => {
                try {
                    return await this.analysisRepo.createAnalysis(
                        input.title,
                        input.description,
                        input.data as Prisma.InputJsonValue,
                    )
                } catch (error) {
                    new ServerError({
                        message: 'Failed to create analysis',
                        whatToDo: 'Please retry later or contact support.',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private storeAnalysis() {
        return procedure
            .input(
                z.object({
                    analysisId: z.number().int().positive(),
                    title: z.string().min(1).optional(),
                    description: z.string().min(1).optional(),
                    data: z.unknown().optional(),
                }),
            )
            .mutation(async ({ input }): Promise<Analysis> => {
                const updateData: {
                    title?: string
                    description?: string
                    data?: Prisma.InputJsonValue
                } = {}
                if (input.title !== undefined) updateData.title = input.title
                if (input.description !== undefined) updateData.description = input.description
                if (input.data !== undefined) updateData.data = input.data as Prisma.InputJsonValue

                if (Object.keys(updateData).length === 0) {
                    new ServerError({
                        message: 'No fields provided to update',
                        whatToDo: 'Send at least one field among title, description, or data.',
                        code: 400,
                    }).throw()
                }
                try {
                    return await this.analysisRepo.updateAnalysis(input.analysisId, updateData)
                } catch (error: any) {
                    if (error?.code === 'P2025') {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            code: 404,
                        }).throw()
                    }
                    new ServerError({
                        message: 'Failed to update analysis',
                        whatToDo: 'Please retry later or contact support.',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private getAnalysisById() {
        return procedure
            .input(
                z.object({
                    analysisId: z.number().int().positive(),
                }),
            )
            .query(async ({ input }): Promise<Analysis> => {
                try {
                    const analysis = await this.analysisRepo.getAnalysisById(input.analysisId)
                    if (!analysis) {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            code: 404,
                        }).throw()
                    }
                    return analysis as Analysis
                } catch (error) {
                    new ServerError({
                        message: 'Failed to retrieve analysis',
                        whatToDo: 'Please retry later or contact support.',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private deleteAnalysis() {
        return procedure
            .input(
                z.object({
                    analysisId: z.number().int().positive(),
                }),
            )
            .mutation(async ({ input }) => {
                try {
                    await this.analysisRepo.deleteAnalysis(input.analysisId)
                    return { success: true }
                } catch (error: any) {
                    if (error?.code === 'P2025') {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            code: 404,
                        }).throw()
                    }
                    new ServerError({
                        message: 'Failed to delete analysis',
                        whatToDo: 'Please retry later or contact support.',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private listAnalyses() {
        return procedure.input(z.object({})).query(async (): Promise<Analysis[]> => {
            try {
                return await this.analysisRepo.listAnalyses()
            } catch (error) {
                console.log(error)
                new ServerError({
                    message: 'Failed to list analyses',
                    whatToDo: 'Please retry later or contact support.',
                    code: 500,
                }).throw()
                throw error
            }
        })
    }

    static make() {
        const inst = new AnalysisController()
        return {
            create: inst.createAnalysis(),
            store: inst.storeAnalysis(),
            get: inst.getAnalysisById(),
            delete: inst.deleteAnalysis(),
            list: inst.listAnalyses(),
        }
    }
}

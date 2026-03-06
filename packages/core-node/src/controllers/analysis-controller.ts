import { z } from 'zod'
import { procedure } from '../routes/root'
import { trpcServer } from '@repo/utils'
import { AnalysisRepository, type AnalysisSummary } from '../repository/analysis-repository'
import { Prisma, type Analysis } from '../../generated/prisma/client'
import { LoggerService } from '../services/logger-service'
import { ImageService } from '../services/image-service'

const { ServerError } = trpcServer

export class AnalysisController {
    private readonly analysisRepo: AnalysisRepository
    private readonly loggerService: LoggerService
    private readonly imageService: ImageService

    constructor() {
        this.analysisRepo = new AnalysisRepository()
        this.loggerService = new LoggerService()
        this.imageService = new ImageService()
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
                    this.loggerService.log({
                        level: 'info',
                        source: 'backend',
                        title: 'Created new analysis',
                        message: `Analysis titled "${input.title}" was created successfully.`,
                        context: input,
                    })
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
                    image: z.string().optional(),
                }),
            )
            .mutation(async ({ input }): Promise<Analysis> => {
                const updateData: {
                    title?: string
                    description?: string
                    data?: Prisma.InputJsonValue
                    imageId?: number | null
                } = {}

                if (input.title !== undefined) updateData.title = input.title
                if (input.description !== undefined) updateData.description = input.description
                if (input.data !== undefined) updateData.data = input.data as Prisma.InputJsonValue

                // Handle image update
                if (input.image !== undefined) {
                    const existingAnalysis = await this.analysisRepo.getAnalysisWithImage(
                        input.analysisId,
                    )
                    if (!existingAnalysis) {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            code: 404,
                        }).throw()
                    }

                    // Delete old image if exists
                    if (existingAnalysis!.image) {
                        await this.imageService.deleteImage(existingAnalysis!.image.id)
                    }

                    // Create new image
                    const newImage = await this.imageService.createImage(input.image)
                    updateData.imageId = newImage.id
                }

                this.loggerService.log({
                    level: 'info',
                    source: 'backend',
                    title: 'Updated analysis',
                    message: `Analysis with ID ${input.analysisId} was updated.`,
                    context: { analysisId: input.analysisId, updateData },
                })

                if (Object.keys(updateData).length === 0) {
                    new ServerError({
                        message: 'No fields provided to update',
                        whatToDo:
                            'Send at least one field among title, description, data, or image.',
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
                            origin: 'getAnalysisById',
                            code: 404,
                        }).throw()
                    }
                    return analysis as Analysis
                } catch (error) {
                    new ServerError({
                        message: 'Failed to retrieve analysis id = ' + input.analysisId,
                        whatToDo: 'Please retry later or contact support.',
                        origin: 'getAnalysisById',
                        code: 500,
                    }).throw()
                    throw error
                }
            })
    }

    private getAnalysisImage() {
        return procedure
            .input(
                z.object({
                    analysisId: z.number().int().positive(),
                }),
            )
            .query(async ({ input }): Promise<{ image: string | null }> => {
                try {
                    const analysis = await this.analysisRepo.getAnalysisWithImage(input.analysisId)
                    if (!analysis) {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            origin: 'getAnalysisImage',
                            code: 404,
                        }).throw()
                    }

                    if (!analysis!.image) {
                        return { image: null }
                    }

                    const imageData = await this.imageService.getImageData(analysis!.image.id)
                    return { image: imageData }
                } catch (error) {
                    new ServerError({
                        message: 'Failed to retrieve analysis image for id = ' + input.analysisId,
                        whatToDo: 'Please retry later or contact support.',
                        origin: 'getAnalysisImage',
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
                    // Get analysis with image to delete image first
                    const analysis = await this.analysisRepo.getAnalysisWithImage(input.analysisId)

                    if (!analysis) {
                        new ServerError({
                            message: 'Analysis not found',
                            whatToDo: 'Please verify the analysis ID.',
                            code: 404,
                        }).throw()
                    }

                    // Delete the analysis first (this removes the foreign key reference)
                    await this.analysisRepo.deleteAnalysis(input.analysisId)

                    // Then delete the image if it exists
                    if (analysis!.image) {
                        await this.imageService.deleteImage(analysis!.image.id)
                    }

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
        return procedure.input(z.object({})).query(async (): Promise<AnalysisSummary[]> => {
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
            getImage: inst.getAnalysisImage(),
            delete: inst.deleteAnalysis(),
            list: inst.listAnalyses(),
        }
    }
}

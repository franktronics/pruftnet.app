import { prisma } from '../db-config'
import { Prisma, type Analysis } from '../../generated/prisma/client'

export type AnalysisSummary = Omit<Analysis, 'data' | 'imageId'>

export type AnalysisWithImage = Analysis & {
    image: { id: number; path: string } | null
}

export class AnalysisRepository {
    public async createAnalysis(
        title: string,
        description: string,
        data: Prisma.InputJsonValue,
    ): Promise<Analysis> {
        return prisma.analysis.create({
            data: {
                title,
                description,
                data,
            },
        })
    }

    public async updateAnalysis(
        analysisId: number,
        data: {
            title?: string
            description?: string
            data?: Prisma.InputJsonValue
            imageId?: number | null
        },
    ): Promise<Analysis> {
        return prisma.analysis.update({
            where: { id: analysisId },
            data,
        })
    }

    public async getAnalysisById(analysisId: number): Promise<Analysis | null> {
        return prisma.analysis.findUnique({
            where: { id: analysisId },
        })
    }

    public async getAnalysisWithImage(analysisId: number): Promise<AnalysisWithImage | null> {
        return prisma.analysis.findUnique({
            where: { id: analysisId },
            include: { image: true },
        })
    }

    public async deleteAnalysis(analysisId: number): Promise<void> {
        await prisma.analysis.delete({
            where: { id: analysisId },
        })
    }

    public async listAnalyses(): Promise<AnalysisSummary[]> {
        return prisma.analysis.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                description: true,
                createdAt: true,
                updatedAt: true,
            },
        })
    }
}

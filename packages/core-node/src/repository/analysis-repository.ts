import { prisma } from '../db-config'
import { Prisma, type Analysis } from '../../generated/prisma/client'

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

    public async deleteAnalysis(analysisId: number): Promise<void> {
        await prisma.analysis.delete({
            where: { id: analysisId },
        })
    }

    public async listAnalyses(): Promise<Analysis[]> {
        return prisma.analysis.findMany({
            orderBy: { createdAt: 'desc' },
        })
    }
}

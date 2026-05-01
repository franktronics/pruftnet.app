import { eq, desc } from 'drizzle-orm'
import { db } from '../db-config'
import { analysis, image, type Analysis, type NewAnalysis } from '../db/schema'

export type AnalysisSummary = Omit<Analysis, 'data' | 'imageId'>

export type AnalysisWithImage = Analysis & {
    image: { id: number; path: string } | null
}

export class AnalysisRepository {
    public async createAnalysis(
        title: string,
        description: string,
        data: unknown,
    ): Promise<Analysis> {
        const now = new Date().toISOString()
        const [created] = db
            .insert(analysis)
            .values({ title, description, data, createdAt: now, updatedAt: now } as NewAnalysis)
            .returning()
            .all()
        return created!
    }

    public async updateAnalysis(
        analysisId: number,
        data: {
            title?: string
            description?: string
            data?: unknown
            imageId?: number | null
        },
    ): Promise<Analysis> {
        const now = new Date().toISOString()
        const [updated] = db
            .update(analysis)
            .set({ ...data, updatedAt: now })
            .where(eq(analysis.id, analysisId))
            .returning()
            .all()
        return updated!
    }

    public async getAnalysisById(analysisId: number): Promise<Analysis | null> {
        return db.select().from(analysis).where(eq(analysis.id, analysisId)).get() ?? null
    }

    public async getAnalysisWithImage(analysisId: number): Promise<AnalysisWithImage | null> {
        const row = db
            .select({
                id: analysis.id,
                title: analysis.title,
                description: analysis.description,
                data: analysis.data,
                imageId: analysis.imageId,
                createdAt: analysis.createdAt,
                updatedAt: analysis.updatedAt,
                imageRowId: image.id,
                imagePath: image.path,
            })
            .from(analysis)
            .leftJoin(image, eq(analysis.imageId, image.id))
            .where(eq(analysis.id, analysisId))
            .get()

        if (!row) return null

        return {
            id: row.id,
            title: row.title,
            description: row.description,
            data: row.data,
            imageId: row.imageId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            image: row.imageRowId != null ? { id: row.imageRowId, path: row.imagePath! } : null,
        }
    }

    public async deleteAnalysis(analysisId: number): Promise<void> {
        db.delete(analysis).where(eq(analysis.id, analysisId)).run()
    }

    public async listAnalyses(): Promise<AnalysisSummary[]> {
        return db
            .select({
                id: analysis.id,
                title: analysis.title,
                description: analysis.description,
                createdAt: analysis.createdAt,
                updatedAt: analysis.updatedAt,
            })
            .from(analysis)
            .orderBy(desc(analysis.createdAt))
            .all()
    }
}

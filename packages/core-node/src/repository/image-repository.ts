import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { db, isPackaged, userDataPath } from '../db-config'
import { image, type Image, type NewImage } from '../db/schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageRoot = process.env.CORE_NODE_ROOT || resolve(__dirname, '..')

const IMAGES_DIR =
    isPackaged && userDataPath ? join(userDataPath, 'images') : join(packageRoot, 'assets/images')

interface Base64ImageData {
    mimeType: string
    extension: string
    buffer: Buffer
}

function parseBase64Image(base64Data: string): Base64ImageData {
    const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches || !matches[1] || !matches[2]) {
        throw new Error('Invalid base64 image format. Expected: data:image/{ext};base64,{data}')
    }
    const extension = matches[1]
    const mimeType = `image/${extension}`
    const buffer = Buffer.from(matches[2], 'base64')
    return { mimeType, extension, buffer }
}

export class ImageRepository {
    public async createImage(base64Data: string): Promise<Image> {
        const { extension, buffer } = parseBase64Image(base64Data)
        const filename = `${randomUUID()}.${extension}`
        const filePath = join(IMAGES_DIR, filename)

        await mkdir(IMAGES_DIR, { recursive: true })
        await writeFile(filePath, buffer)

        const now = new Date().toISOString()
        const [created] = db
            .insert(image)
            .values({ path: filename, createdAt: now, updatedAt: now } as NewImage)
            .returning()
            .all()
        return created!
    }

    public async getImageById(imageId: number): Promise<Image | null> {
        return db.select().from(image).where(eq(image.id, imageId)).get() ?? null
    }

    public async getImageData(imageId: number): Promise<string | null> {
        const img = await this.getImageById(imageId)
        if (!img) return null

        const filePath = join(IMAGES_DIR, img.path)
        const buffer = await readFile(filePath)
        const extension = img.path.split('.').pop() ?? 'png'
        return `data:image/${extension};base64,${buffer.toString('base64')}`
    }

    public async deleteImage(imageId: number): Promise<void> {
        const img = await this.getImageById(imageId)
        if (!img) return

        db.delete(image).where(eq(image.id, imageId)).run()

        try {
            await unlink(join(IMAGES_DIR, img.path))
        } catch {
            // File may not exist
        }
    }

    public async updateImage(imageId: number, base64Data: string): Promise<Image> {
        const existing = await this.getImageById(imageId)
        if (!existing) throw new Error(`Image with id ${imageId} not found`)

        const { extension, buffer } = parseBase64Image(base64Data)
        const newFilename = `${randomUUID()}.${extension}`
        await writeFile(join(IMAGES_DIR, newFilename), buffer)

        const now = new Date().toISOString()
        const [updated] = db
            .update(image)
            .set({ path: newFilename, updatedAt: now })
            .where(eq(image.id, imageId))
            .returning()
            .all()

        try {
            await unlink(join(IMAGES_DIR, existing.path))
        } catch {
            // Old file may not exist
        }

        return updated!
    }
}

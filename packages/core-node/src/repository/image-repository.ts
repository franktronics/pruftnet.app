import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { prisma } from '../db-config'

import type { Image } from '../../generated/prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Use CORE_NODE_ROOT if defined (Electron bundled context), otherwise resolve from __dirname
const packageRoot = process.env.CORE_NODE_ROOT || resolve(__dirname, '..')
const IMAGES_DIR = join(packageRoot, 'assets/images')

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

        return prisma.image.create({
            data: { path: filename },
        })
    }

    public async getImageById(imageId: number): Promise<Image | null> {
        return prisma.image.findUnique({
            where: { id: imageId },
        })
    }

    public async getImageData(imageId: number): Promise<string | null> {
        const image = await this.getImageById(imageId)
        if (!image) return null

        const filePath = join(IMAGES_DIR, image.path)
        const buffer = await readFile(filePath)
        const extension = image.path.split('.').pop() ?? 'png'
        const base64 = buffer.toString('base64')

        return `data:image/${extension};base64,${base64}`
    }

    public async deleteImage(imageId: number): Promise<void> {
        const image = await this.getImageById(imageId)
        if (!image) return

        const filePath = join(IMAGES_DIR, image.path)

        await prisma.image.delete({
            where: { id: imageId },
        })

        try {
            await unlink(filePath)
        } catch {
            // File may not exist, ignore error
        }
    }

    public async updateImage(imageId: number, base64Data: string): Promise<Image> {
        const existingImage = await this.getImageById(imageId)
        if (!existingImage) {
            throw new Error(`Image with id ${imageId} not found`)
        }

        const oldFilePath = join(IMAGES_DIR, existingImage.path)

        const { extension, buffer } = parseBase64Image(base64Data)
        const newFilename = `${randomUUID()}.${extension}`
        const newFilePath = join(IMAGES_DIR, newFilename)

        await writeFile(newFilePath, buffer)

        const updatedImage = await prisma.image.update({
            where: { id: imageId },
            data: { path: newFilename },
        })

        try {
            await unlink(oldFilePath)
        } catch {
            // Old file may not exist, ignore error
        }

        return updatedImage
    }
}

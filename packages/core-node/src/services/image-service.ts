import type { Image } from '../../generated/prisma/client'

import { ImageRepository } from '../repository/image-repository'

export class ImageService {
    private readonly repo: ImageRepository

    constructor() {
        this.repo = new ImageRepository()
    }

    public async createImage(base64Data: string): Promise<Image> {
        return this.repo.createImage(base64Data)
    }

    public async getImageById(imageId: number): Promise<Image | null> {
        return this.repo.getImageById(imageId)
    }

    public async getImageData(imageId: number): Promise<string | null> {
        return this.repo.getImageData(imageId)
    }

    public async deleteImage(imageId: number): Promise<void> {
        return this.repo.deleteImage(imageId)
    }

    public async updateImage(imageId: number, base64Data: string): Promise<Image> {
        return this.repo.updateImage(imageId, base64Data)
    }
}

export class NetworkMapControl {
    private readonly mapElt: HTMLElement
    private isDragging = false
    private dragStart = { x: 0, y: 0 }
    private currentTransform = { x: 0, y: 0, scale: 1 }
    private lastTouchDistance = 0
    private mapSize = 20000
    private maxZoom = 5
    private effectiveMapSize = this.mapSize

    constructor(private readonly containerElt: HTMLDivElement) {
        this.mapElt = containerElt.firstChild?.firstChild as HTMLElement
        this.initializeMap()
        this.initializeDragAndDrop()
        this.initializeZoom()
        this.initializeTouchEvents()
    }
    private initializeMap(): void {
        // Update effective map size to be at least as large as the container
        this.effectiveMapSize = Math.max(
            this.mapSize,
            Math.max(window.innerWidth, window.innerHeight),
        )
        this.mapElt.style.width = `${this.effectiveMapSize}px`
        this.mapElt.style.height = `${this.effectiveMapSize}px`
        this.mapElt.style.transformOrigin = '0 0'

        this.centerMap()
        this.updateTransform()
    }

    private initializeDragAndDrop(): void {
        this.mapElt.addEventListener('mousedown', this.handleMouseDown.bind(this))
        document.addEventListener('mousemove', this.handleMouseMove.bind(this))
        document.addEventListener('mouseup', this.handleMouseUp.bind(this))

        this.mapElt.style.cursor = 'grab'
        this.containerElt.style.touchAction = 'none'
    }

    private initializeZoom(): void {
        this.mapElt.addEventListener('wheel', this.handleWheel.bind(this), { passive: false })
    }

    private initializeTouchEvents(): void {
        this.mapElt.addEventListener('touchstart', this.handleTouchStart.bind(this), {
            passive: false,
        })
        this.mapElt.addEventListener('touchmove', this.handleTouchMove.bind(this), {
            passive: false,
        })
        this.mapElt.addEventListener('touchend', this.handleTouchEnd.bind(this), {
            passive: false,
        })
    }

    private handleMouseDown(event: MouseEvent): void {
        this.isDragging = true
        this.dragStart.x = event.clientX - this.currentTransform.x
        this.dragStart.y = event.clientY - this.currentTransform.y
        this.mapElt.style.cursor = 'grabbing'
    }

    private handleMouseMove(event: MouseEvent): void {
        if (!this.isDragging) return

        const newX = event.clientX - this.dragStart.x
        const newY = event.clientY - this.dragStart.y

        this.currentTransform.x = this.constrainX(newX)
        this.currentTransform.y = this.constrainY(newY)
        this.updateTransform()
    }

    private handleMouseUp(): void {
        this.isDragging = false
        this.mapElt.style.cursor = 'grab'
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault()

        const rect = this.containerElt.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top

        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
        const newScale = this.constrainScale(this.currentTransform.scale * scaleFactor)

        if (newScale !== this.currentTransform.scale) {
            const scaleChange = newScale / this.currentTransform.scale

            const newX = mouseX - (mouseX - this.currentTransform.x) * scaleChange
            const newY = mouseY - (mouseY - this.currentTransform.y) * scaleChange

            this.currentTransform.x = this.constrainX(newX)
            this.currentTransform.y = this.constrainY(newY)
            this.currentTransform.scale = newScale

            this.updateTransform()
        }
    }

    private updateTransform(): void {
        const { x, y, scale } = this.currentTransform
        this.mapElt.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }

    private handleTouchStart(event: TouchEvent): void {
        event.preventDefault()

        if (event.touches.length === 1) {
            this.isDragging = true
            const touch = event.touches[0]!
            this.dragStart.x = touch.clientX - this.currentTransform.x
            this.dragStart.y = touch.clientY - this.currentTransform.y
        } else if (event.touches.length === 2) {
            this.isDragging = false
            const touch1 = event.touches[0]!
            const touch2 = event.touches[1]!

            this.lastTouchDistance = this.getTouchDistance(touch1, touch2)
        }
    }

    private handleTouchMove(event: TouchEvent): void {
        event.preventDefault()

        if (event.touches.length === 1 && this.isDragging) {
            const touch = event.touches[0]!
            const newX = touch.clientX - this.dragStart.x
            const newY = touch.clientY - this.dragStart.y

            this.currentTransform.x = this.constrainX(newX)
            this.currentTransform.y = this.constrainY(newY)
            this.updateTransform()
        } else if (event.touches.length === 2) {
            const touch1 = event.touches[0]!
            const touch2 = event.touches[1]!

            const currentDistance = this.getTouchDistance(touch1, touch2)
            const currentCenter = this.getTouchCenter(touch1, touch2)

            if (this.lastTouchDistance > 0) {
                const scaleChange = currentDistance / this.lastTouchDistance
                const newScale = this.constrainScale(this.currentTransform.scale * scaleChange)

                if (newScale !== this.currentTransform.scale) {
                    const rect = this.containerElt.getBoundingClientRect()
                    const centerX = currentCenter.x - rect.left
                    const centerY = currentCenter.y - rect.top

                    const scaleFactor = newScale / this.currentTransform.scale

                    const newX = centerX - (centerX - this.currentTransform.x) * scaleFactor
                    const newY = centerY - (centerY - this.currentTransform.y) * scaleFactor

                    this.currentTransform.x = this.constrainX(newX)
                    this.currentTransform.y = this.constrainY(newY)
                    this.currentTransform.scale = newScale

                    this.updateTransform()
                }
            }

            this.lastTouchDistance = currentDistance
        }
    }

    private handleTouchEnd(event: TouchEvent): void {
        event.preventDefault()

        if (event.touches.length === 0) {
            this.isDragging = false
            this.lastTouchDistance = 0
        } else if (event.touches.length === 1) {
            this.lastTouchDistance = 0
        }
    }

    private getTouchDistance(touch1: Touch, touch2: Touch): number {
        const dx = touch1.clientX - touch2.clientX
        const dy = touch1.clientY - touch2.clientY
        return Math.sqrt(dx * dx + dy * dy)
    }

    private getTouchCenter(touch1: Touch, touch2: Touch): { x: number; y: number } {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2,
        }
    }

    private constrainX(x: number): number {
        const containerRect = this.containerElt.getBoundingClientRect()
        const scaledMapWidth = this.effectiveMapSize * this.currentTransform.scale

        // center if map is smaller than container
        if (scaledMapWidth <= containerRect.width) {
            return (containerRect.width - scaledMapWidth) / 2
        }

        // Otherwise, constrain to limits
        const minX = containerRect.width - scaledMapWidth
        const maxX = 0
        return Math.max(minX, Math.min(maxX, x))
    }

    private constrainY(y: number): number {
        const containerRect = this.containerElt.getBoundingClientRect()
        const scaledMapHeight = this.effectiveMapSize * this.currentTransform.scale

        // center if map is smaller than container
        if (scaledMapHeight <= containerRect.height) {
            return (containerRect.height - scaledMapHeight) / 2
        }

        // Otherwise, constrain to limits
        const minY = containerRect.height - scaledMapHeight
        const maxY = 0
        return Math.max(minY, Math.min(maxY, y))
    }

    private getMinZoom(): number {
        const containerRect = this.containerElt.getBoundingClientRect()
        // The minimum zoom ensures the map fits entirely within the container
        // The smaller dimension (width or height) determines the minimum scale
        return Math.max(
            containerRect.width / this.effectiveMapSize,
            containerRect.height / this.effectiveMapSize,
        )
    }

    private constrainScale(scale: number): number {
        const minZoom = this.getMinZoom()
        return Math.max(minZoom, Math.min(this.maxZoom, scale))
    }

    private centerMap(): void {
        const containerRect = this.containerElt.getBoundingClientRect()

        const centerX =
            (containerRect.width - this.effectiveMapSize * this.currentTransform.scale) / 2
        const centerY =
            (containerRect.height - this.effectiveMapSize * this.currentTransform.scale) / 2

        this.currentTransform.x = centerX
        this.currentTransform.y = centerY
    }
}

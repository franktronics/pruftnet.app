export class NetworkMapControl {
    private readonly mapElt: HTMLElement
    private isDragging = false
    private dragStart = { x: 0, y: 0 }
    private currentTransform = { x: 0, y: 0, scale: 1 }
    private lastTouchDistance = 0
    private touchCenter = { x: 0, y: 0 }

    constructor(private readonly containerElt: HTMLDivElement) {
        this.mapElt = containerElt.firstChild as HTMLElement
        this.initializeDragAndDrop()
        this.initializeZoom()
        this.initializeTouchEvents()
    }

    private initializeDragAndDrop(): void {
        this.containerElt.addEventListener('mousedown', this.handleMouseDown.bind(this))
        document.addEventListener('mousemove', this.handleMouseMove.bind(this))
        document.addEventListener('mouseup', this.handleMouseUp.bind(this))

        this.containerElt.style.cursor = 'grab'
        this.containerElt.style.touchAction = 'none'
    }

    private initializeZoom(): void {
        this.containerElt.addEventListener('wheel', this.handleWheel.bind(this), { passive: false })
    }

    private initializeTouchEvents(): void {
        this.containerElt.addEventListener('touchstart', this.handleTouchStart.bind(this), {
            passive: false,
        })
        this.containerElt.addEventListener('touchmove', this.handleTouchMove.bind(this), {
            passive: false,
        })
        this.containerElt.addEventListener('touchend', this.handleTouchEnd.bind(this), {
            passive: false,
        })
    }

    private handleMouseDown(event: MouseEvent): void {
        this.isDragging = true
        this.dragStart.x = event.clientX - this.currentTransform.x
        this.dragStart.y = event.clientY - this.currentTransform.y
        this.containerElt.style.cursor = 'grabbing'
    }

    private handleMouseMove(event: MouseEvent): void {
        if (!this.isDragging) return

        this.currentTransform.x = event.clientX - this.dragStart.x
        this.currentTransform.y = event.clientY - this.dragStart.y
        this.updateTransform()
    }

    private handleMouseUp(): void {
        this.isDragging = false
        this.containerElt.style.cursor = 'grab'
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault()

        const rect = this.containerElt.getBoundingClientRect()
        const mouseX = event.clientX - rect.left
        const mouseY = event.clientY - rect.top

        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1
        const newScale = Math.max(0.1, Math.min(5, this.currentTransform.scale * scaleFactor))

        if (newScale !== this.currentTransform.scale) {
            const scaleChange = newScale / this.currentTransform.scale

            this.currentTransform.x = mouseX - (mouseX - this.currentTransform.x) * scaleChange
            this.currentTransform.y = mouseY - (mouseY - this.currentTransform.y) * scaleChange
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
            this.touchCenter = this.getTouchCenter(touch1, touch2)
        }
    }

    private handleTouchMove(event: TouchEvent): void {
        event.preventDefault()

        if (event.touches.length === 1 && this.isDragging) {
            const touch = event.touches[0]!
            this.currentTransform.x = touch.clientX - this.dragStart.x
            this.currentTransform.y = touch.clientY - this.dragStart.y
            this.updateTransform()
        } else if (event.touches.length === 2) {
            const touch1 = event.touches[0]!
            const touch2 = event.touches[1]!

            const currentDistance = this.getTouchDistance(touch1, touch2)
            const currentCenter = this.getTouchCenter(touch1, touch2)

            if (this.lastTouchDistance > 0) {
                const scaleChange = currentDistance / this.lastTouchDistance
                const newScale = Math.max(
                    0.1,
                    Math.min(5, this.currentTransform.scale * scaleChange),
                )

                if (newScale !== this.currentTransform.scale) {
                    const rect = this.containerElt.getBoundingClientRect()
                    const centerX = currentCenter.x - rect.left
                    const centerY = currentCenter.y - rect.top

                    const scaleFactor = newScale / this.currentTransform.scale

                    this.currentTransform.x =
                        centerX - (centerX - this.currentTransform.x) * scaleFactor
                    this.currentTransform.y =
                        centerY - (centerY - this.currentTransform.y) * scaleFactor
                    this.currentTransform.scale = newScale

                    this.updateTransform()
                }
            }

            this.lastTouchDistance = currentDistance
            this.touchCenter = currentCenter
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
}

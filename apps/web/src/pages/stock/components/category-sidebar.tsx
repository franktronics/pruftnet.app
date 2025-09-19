import React, { ComponentPropsWithoutRef, useEffect, useRef, useState } from 'react'
import { cn } from '@repo/utils'

export type CategorySidebarProps = {
    minWidth?: number
    initialWidth?: number
    maxWidth?: number
} & ComponentPropsWithoutRef<'div'>
export const CategorySidebar = (props: CategorySidebarProps) => {
    const { className, minWidth = 15, maxWidth = 25, initialWidth = 20, children, ...rest } = props

    const [width, setWidth] = useState<number>(0)
    const sidebarRef = useRef<HTMLDivElement>(null)
    const isResizing = useRef(false)

    useEffect(() => {
        if (sidebarRef.current && sidebarRef.current.parentElement) {
            const parentWidth = sidebarRef.current.parentElement.offsetWidth
            setWidth((initialWidth / 100) * parentWidth)
        }
    }, [])

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        isResizing.current = true
        document.body.style.cursor = 'col-resize'

        const startX = e.clientX
        const startWidth = width
        const parentWidth = sidebarRef.current?.parentElement?.offsetWidth || 1

        const minSidebarWidth = (minWidth / 100) * parentWidth
        const maxSidebarWidth = (maxWidth / 100) * parentWidth

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isResizing.current) return
            const delta = moveEvent.clientX - startX
            let newWidth = startWidth + delta
            newWidth = Math.max(minSidebarWidth, Math.min(maxSidebarWidth, newWidth))
            setWidth(newWidth)
        }

        const onMouseUp = () => {
            isResizing.current = false
            document.body.style.cursor = ''
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    return (
        <>
            <div
                ref={sidebarRef}
                className={cn(
                    'bg-sidebar relative flex h-full flex-col border-r',
                    'absolute top-0 bottom-0 left-0',
                    className,
                )}
                style={{ width }}
                {...rest}
            >
                {children}
                <div
                    className={cn(
                        'hover:bg-accent absolute top-0 -right-1.5 z-10 h-full w-2 cursor-col-resize transition-colors',
                    )}
                    onMouseDown={handleMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize sidebar"
                    tabIndex={0}
                />
            </div>
            <div className="pointer-events-none -z-10 h-full" style={{ width }}></div>
        </>
    )
}

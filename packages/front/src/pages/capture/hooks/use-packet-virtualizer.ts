import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from 'react'

import { packetViewport } from '#front/pages/capture/model/packet-viewport'
import { PACKET_ROW_HEIGHT } from '#front/pages/capture/model/packet-view'

export function usePacketVirtualizer(count: number, scrollRef: RefObject<HTMLDivElement | null>) {
    const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 })
    useLayoutEffect(() => {
        const element = scrollRef.current
        if (!element) return
        const update = () => {
            const height = element.clientHeight
            const scrollTop = element.scrollTop
            setViewport((current) =>
                current.height === height && current.scrollTop === scrollTop
                    ? current
                    : { height, scrollTop },
            )
        }
        const observer = new ResizeObserver(update)
        observer.observe(element)
        element.addEventListener('scroll', update, { passive: true })
        update()
        return () => {
            observer.disconnect()
            element.removeEventListener('scroll', update)
        }
    }, [scrollRef])
    const geometry = useMemo(
        () => packetViewport(count, viewport.height, viewport.scrollTop),
        [count, viewport.height, viewport.scrollTop],
    )
    useLayoutEffect(() => {
        const element = scrollRef.current
        if (!element || geometry.scale <= 1) return
        const wheel = (event: WheelEvent) => {
            if (event.ctrlKey || event.deltaY === 0) return
            const current = packetViewport(count, element.clientHeight, element.scrollTop)
            const unit =
                event.deltaMode === 1
                    ? PACKET_ROW_HEIGHT
                    : event.deltaMode === 2
                      ? element.clientHeight
                      : 1
            const next = Math.max(
                0,
                Math.min(current.logicalMaximum, current.logicalOffset + event.deltaY * unit),
            )
            event.preventDefault()
            element.scrollTop = next / current.scale
        }
        element.addEventListener('wheel', wheel, { passive: false })
        return () => element.removeEventListener('wheel', wheel)
    }, [count, geometry.scale, scrollRef])
    const scrollToIndex = useCallback(
        (index: number, { align }: { align: 'start' | 'end' | 'auto' }) => {
            const element = scrollRef.current
            if (!element || count === 0) return
            const current = packetViewport(count, element.clientHeight, element.scrollTop)
            const start = Math.max(0, Math.min(count - 1, index)) * PACKET_ROW_HEIGHT
            let target = start
            if (align === 'end') target = start + PACKET_ROW_HEIGHT - element.clientHeight
            if (align === 'auto') {
                if (
                    start >= current.logicalOffset &&
                    start + PACKET_ROW_HEIGHT <= current.logicalOffset + element.clientHeight
                )
                    return
                if (start > current.logicalOffset)
                    target = start + PACKET_ROW_HEIGHT - element.clientHeight
            }
            element.scrollTop =
                Math.max(0, Math.min(current.logicalMaximum, target)) / current.scale
        },
        [count, scrollRef],
    )
    return { ...geometry, scrollToIndex }
}

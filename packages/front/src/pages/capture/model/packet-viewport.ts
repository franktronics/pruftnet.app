import { PACKET_ROW_HEIGHT } from './packet-view'

// Below the scroll-height limits of Chromium, Firefox and WebKit. Map the
// scrollbar to logical packet positions when the capture exceeds this height.
export const MAX_PACKET_SCROLL_HEIGHT = 16_000_000

export function packetViewport(count: number, height: number, scrollTop: number, overscan = 12) {
    const logicalHeight = count * PACKET_ROW_HEIGHT
    const totalSize = Math.min(MAX_PACKET_SCROLL_HEIGHT, logicalHeight)
    const physicalMaximum = Math.max(0, totalSize - height)
    const logicalMaximum = Math.max(0, logicalHeight - height)
    const scale = physicalMaximum > 0 ? logicalMaximum / physicalMaximum : 1
    const physicalOffset = Math.max(0, Math.min(physicalMaximum, scrollTop))
    const logicalOffset = physicalOffset * scale
    const first = Math.max(0, Math.floor(logicalOffset / PACKET_ROW_HEIGHT) - overscan)
    const end = Math.min(count, Math.ceil((logicalOffset + height) / PACKET_ROW_HEIGHT) + overscan)
    return {
        totalSize,
        scale,
        logicalOffset,
        logicalMaximum,
        items: Array.from({ length: Math.max(0, end - first) }, (_, offset) => {
            const index = first + offset
            return {
                index,
                key: index,
                size: PACKET_ROW_HEIGHT,
                start: index * PACKET_ROW_HEIGHT - logicalOffset + physicalOffset,
            }
        }),
    }
}

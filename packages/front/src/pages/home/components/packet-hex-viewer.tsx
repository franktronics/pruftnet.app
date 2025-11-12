import { useState, useEffect } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@repo/utils'

export type PacketHexViewerProps = {
    data: Uint8Array
    bytesPerLine?: number
} & ComponentPropsWithoutRef<'div'>

export const PacketHexViewer = (props: PacketHexViewerProps) => {
    const { data, bytesPerLine, className, ...rest } = props
    const [highlightedByte, setHighlightedByte] = useState<number | null>(null)
    const [isMobile, setIsMobile] = useState(false)

    const effectiveBytesPerLine = bytesPerLine ?? (isMobile ? 8 : 16)

    useEffect(() => {
        const checkIsMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkIsMobile()
        window.addEventListener('resize', checkIsMobile)

        return () => window.removeEventListener('resize', checkIsMobile)
    }, [])

    const formatHex = (byte: number): string => {
        return byte.toString(16).padStart(2, '0').toUpperCase()
    }

    const formatAscii = (byte: number): string => {
        return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'
    }

    const getLineOffset = (lineIndex: number): string => {
        return (lineIndex * effectiveBytesPerLine).toString(16).padStart(8, '0').toUpperCase()
    }

    const lines = []
    for (let i = 0; i < data.length; i += effectiveBytesPerLine) {
        const lineData = data.slice(i, i + effectiveBytesPerLine)
        lines.push({ offset: i, data: lineData })
    }

    return (
        <div
            className={cn(
                'bg-card rounded-lg border p-4 font-mono text-sm',
                'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border overflow-x-auto',
                className,
            )}
            {...rest}
        >
            <div className="flex min-w-fit flex-col lg:flex-row">
                <div className="flex-1 lg:mr-4">
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                        Offset
                    </div>
                    {lines.map((line, lineIndex) => (
                        <div key={lineIndex} className="mb-1 flex items-center">
                            <div className="text-muted-foreground mr-3 w-16 shrink-0 text-xs sm:mr-4 sm:w-20">
                                {getLineOffset(lineIndex)}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {Array.from(line.data).map((byte, byteIndex) => {
                                    const globalIndex = line.offset + byteIndex
                                    const isHighlighted = highlightedByte === globalIndex
                                    return (
                                        <span
                                            key={byteIndex}
                                            className={cn(
                                                'cursor-pointer rounded px-1 py-0.5 text-xs transition-colors',
                                                'hover:bg-accent hover:text-accent-foreground',
                                                isHighlighted &&
                                                    'bg-primary text-primary-foreground',
                                            )}
                                            onMouseEnter={() => setHighlightedByte(globalIndex)}
                                            onMouseLeave={() => setHighlightedByte(null)}
                                        >
                                            {formatHex(byte)}
                                        </span>
                                    )
                                })}
                                {line.data.length < effectiveBytesPerLine && (
                                    <div className="hidden sm:block">
                                        {Array(effectiveBytesPerLine - line.data.length)
                                            .fill('')
                                            .map((_, i) => (
                                                <span
                                                    key={i}
                                                    className="mr-2 inline-block w-6 text-xs"
                                                >
                                                    {'  '}
                                                </span>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-border my-4 h-px lg:mx-4 lg:my-0 lg:h-auto lg:w-px"></div>

                <div className="shrink-0">
                    <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                        ASCII
                    </div>
                    {lines.map((line, lineIndex) => (
                        <div key={lineIndex} className="mb-1 flex">
                            {Array.from(line.data).map((byte, byteIndex) => {
                                const globalIndex = line.offset + byteIndex
                                const isHighlighted = highlightedByte === globalIndex
                                return (
                                    <span
                                        key={byteIndex}
                                        className={cn(
                                            'cursor-pointer rounded px-0.5 py-0.5 text-xs transition-colors',
                                            'hover:bg-accent hover:text-accent-foreground',
                                            isHighlighted && 'bg-primary text-primary-foreground',
                                        )}
                                        onMouseEnter={() => setHighlightedByte(globalIndex)}
                                        onMouseLeave={() => setHighlightedByte(null)}
                                    >
                                        {formatAscii(byte)}
                                    </span>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

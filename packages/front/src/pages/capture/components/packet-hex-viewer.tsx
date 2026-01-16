import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import { cn, BaseConverter } from '@repo/utils'
import { useIsMobile } from '@repo/ui/hooks'
import { Separator } from '@repo/ui/atoms'

export type PacketHexViewerProps = {
    data: string | null
    bytesPerLine?: number
} & ComponentPropsWithoutRef<'div'>

export const PacketHexViewer = (props: PacketHexViewerProps) => {
    const { data, bytesPerLine, className, ...rest } = props
    const [highlightedByte, setHighlightedByte] = useState<number | null>(null)
    const isMobile = useIsMobile()

    const effectiveBytesPerLine = bytesPerLine ?? (isMobile ? 8 : 16)

    const getLineOffset = (lineIndex: number): string => {
        return (lineIndex * effectiveBytesPerLine).toString(16).padStart(5, '0').toUpperCase()
    }
    const decodedData: Uint8Array<ArrayBuffer> = useMemo(() => {
        if (!data) return new Uint8Array()
        return Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    }, [data])

    const lines = []
    if (decodedData) {
        for (let i = 0; i < decodedData.length; i += effectiveBytesPerLine) {
            const lineData = decodedData.slice(i, i + effectiveBytesPerLine)
            lines.push({ offset: i, data: lineData })
        }
    }

    return (
        <div
            className={cn(
                'bg-card rounded-lg p-4 font-mono text-sm',
                'scrollbar-thin overflow-auto',
                'flex h-full flex-col',
                className,
            )}
            {...rest}
        >
            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                Hex Dump
            </div>
            <div className="scrollbar-thin flex min-w-fit flex-1 flex-col overflow-auto lg:flex-row">
                <aside>
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                        Offset
                    </div>
                    {lines.map((line, lineIndex) => (
                        <div key={lineIndex} className="mb-1 flex items-start">
                            <div className="text-muted-foreground mr-1 w-12 shrink-0 py-0.5 text-xs">
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
                                            {BaseConverter.formatHex(byte)}
                                        </span>
                                    )
                                })}
                                {line.data.length < effectiveBytesPerLine && (
                                    <div className="hidden lg:block">
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
                </aside>

                <Separator className="mx-4 hidden lg:block" orientation="vertical" />
                <Separator className="my-4 block lg:hidden" orientation="horizontal" />

                <aside className="shrink-0">
                    <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
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
                                        {BaseConverter.formatAscii(byte)}
                                    </span>
                                )
                            })}
                        </div>
                    ))}
                </aside>
            </div>
        </div>
    )
}

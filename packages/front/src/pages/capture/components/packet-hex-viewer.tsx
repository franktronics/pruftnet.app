import { useMemo, useState, useCallback, type ComponentPropsWithoutRef } from 'react'
import { cn, BaseConverter } from '@repo/utils'
import { useIsMobile } from '@repo/ui/hooks'
import { Separator } from '@repo/ui/atoms'
import type { PacketData, ParsedPacket } from '@repo/core-node/types'

interface FieldGroup {
    id: string
    startByte: number
    endByte: number
}

const parseFieldGroups = (parsed: ParsedPacket): FieldGroup[] => {
    const groups: FieldGroup[] = []

    parsed.forEach((layer, layerIndex) => {
        Object.entries(layer).forEach(([key, _value]) => {
            if (key === 'file') return

            const parts = key.split('_')
            if (parts.length !== 3) return

            const sizeBits = parseInt(parts[1], 10)
            const absolutePosBits = parseInt(parts[2], 10)

            if (isNaN(sizeBits) || isNaN(absolutePosBits)) return

            const startByte = Math.floor(absolutePosBits / 8)
            const endByte = Math.floor((absolutePosBits + sizeBits - 1) / 8)

            groups.push({
                id: `${layerIndex}-${key}`,
                startByte,
                endByte,
            })
        })
    })

    return groups
}

const buildByteToFieldMap = (groups: FieldGroup[]): Map<number, string> => {
    const byteToField = new Map<number, string>()

    const sortedGroups = [...groups].sort((a, b) => a.startByte - b.startByte)

    for (const group of sortedGroups) {
        for (let byte = group.startByte; byte <= group.endByte; byte++) {
            if (!byteToField.has(byte)) {
                byteToField.set(byte, group.id)
            }
        }
    }

    return byteToField
}

const buildFieldToByteMap = (groups: FieldGroup[]): Map<string, number[]> => {
    const fieldToBytes = new Map<string, number[]>()

    for (const group of groups) {
        const bytes: number[] = []
        for (let byte = group.startByte; byte <= group.endByte; byte++) {
            bytes.push(byte)
        }
        fieldToBytes.set(group.id, bytes)
    }

    return fieldToBytes
}

export type PacketHexViewerProps = {
    packet: PacketData | null | undefined
} & ComponentPropsWithoutRef<'div'>

export const PacketHexViewer = (props: PacketHexViewerProps) => {
    const { packet, className, ...rest } = props
    const [hoveredField, setHoveredField] = useState<string | null>(null)
    const [selectedField, setSelectedField] = useState<string | null>(null)

    const isMobile = useIsMobile()
    const bytesPerLine = isMobile ? 8 : 16

    const getLineOffset = (lineIndex: number): string => {
        return (lineIndex * bytesPerLine).toString(16).padStart(5, '0').toUpperCase()
    }

    const decodedData = useMemo(() => {
        if (!packet) return new Uint8Array()
        return Uint8Array.from(atob(packet.raw.data), (c) => c.charCodeAt(0))
    }, [packet])

    const { byteToField, fieldToBytes } = useMemo(() => {
        if (!packet?.parsed) {
            return {
                byteToField: new Map<number, string>(),
                fieldToBytes: new Map<string, number[]>(),
            }
        }
        const groups = parseFieldGroups(packet.parsed)
        return {
            byteToField: buildByteToFieldMap(groups),
            fieldToBytes: buildFieldToByteMap(groups),
        }
    }, [packet?.parsed])

    const lines = useMemo(() => {
        const result = []
        for (let i = 0; i < decodedData.length; i += bytesPerLine) {
            const lineData = decodedData.slice(i, i + bytesPerLine)
            result.push({ offset: i, data: lineData })
        }
        return result
    }, [decodedData, bytesPerLine])

    const highlightedBytes = useMemo(() => {
        const activeField = selectedField ?? hoveredField
        if (!activeField) return new Set<number>()
        return new Set(fieldToBytes.get(activeField) ?? [])
    }, [hoveredField, selectedField, fieldToBytes])

    const handleByteHover = useCallback(
        (byteIndex: number) => {
            const fieldId = byteToField.get(byteIndex)
            setHoveredField(fieldId ?? null)
        },
        [byteToField],
    )

    const handleByteLeave = useCallback(() => {
        setHoveredField(null)
    }, [])

    const handleByteClick = useCallback(
        (byteIndex: number) => {
            const fieldId = byteToField.get(byteIndex)
            if (!fieldId) return
            setSelectedField((prev) => (prev === fieldId ? null : fieldId))
        },
        [byteToField],
    )

    const isHighlighted = useCallback(
        (byteIndex: number) => highlightedBytes.has(byteIndex),
        [highlightedBytes],
    )

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
                                    return (
                                        <span
                                            key={byteIndex}
                                            className={cn(
                                                'cursor-pointer px-1 py-0.5 text-xs transition-colors',
                                                {
                                                    'bg-primary text-primary-foreground':
                                                        isHighlighted(globalIndex),
                                                },
                                            )}
                                            onMouseEnter={() => handleByteHover(globalIndex)}
                                            onMouseLeave={handleByteLeave}
                                            onClick={() => handleByteClick(globalIndex)}
                                        >
                                            {BaseConverter.formatHex(byte)}
                                        </span>
                                    )
                                })}
                                {line.data.length < bytesPerLine && (
                                    <div className="hidden lg:block">
                                        {Array(bytesPerLine - line.data.length)
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
                                return (
                                    <span
                                        key={byteIndex}
                                        className={cn(
                                            'cursor-pointer px-0.5 py-0.5 text-xs transition-colors',
                                            {
                                                'bg-primary text-primary-foreground':
                                                    isHighlighted(globalIndex),
                                            },
                                        )}
                                        onMouseEnter={() => handleByteHover(globalIndex)}
                                        onMouseLeave={handleByteLeave}
                                        onClick={() => handleByteClick(globalIndex)}
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

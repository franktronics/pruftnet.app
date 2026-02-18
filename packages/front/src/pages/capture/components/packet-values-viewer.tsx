import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@repo/utils'
import type { ProtocolFileData, PacketData } from '@repo/core-node/types'
import { ChevronRightIcon } from 'lucide-react'
import { DissectorValueFormatter, type BlockDataType } from '../utils/dissector-formatter'

export type PacketValuesViewerProps = {
    protoFiles: Record<string, ProtocolFileData & { pending: boolean; error: Error | null }>
    packet: PacketData | null | undefined
} & ComponentPropsWithoutRef<'div'>

export const PacketValuesViewer = (props: PacketValuesViewerProps) => {
    const { className, protoFiles, packet, ...rest } = props

    const blockData = useMemo(() => {
        const valueFormatter = new DissectorValueFormatter(protoFiles, packet ?? null)
        return valueFormatter.getBlockData()
    }, [packet, protoFiles])

    if (!packet) {
        return <NoPacketSelected className={className} {...rest} />
    }

    return (
        <div
            className={cn(
                'bg-card rounded-lg p-4',
                'font-mono text-sm',
                'scrollbar-thin h-full overflow-auto',
                className,
            )}
            {...rest}
        >
            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                Packet Structure
            </div>
            <div className="space-y-1">
                {blockData.map((data, id) => (
                    <Block key={id} title={data.title} size={data.size} values={data.values} />
                ))}
            </div>
        </div>
    )
}

const Block = (props: BlockDataType & ComponentPropsWithoutRef<'div'>) => {
    const { title, size, values, ...rest } = props
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="group" {...rest}>
            <button
                type="button"
                className={cn(
                    'hover:bg-accent hover:text-accent-foreground',
                    'flex w-full items-center rounded p-1 transition-colors',
                )}
                onClick={() => setExpanded((v) => !v)}
            >
                <div className="grid w-full grid-cols-[1rem_1fr_auto] items-center gap-2">
                    <ChevronRightIcon
                        className={cn('text-muted-foreground size-4', {
                            'rotate-90': expanded,
                        })}
                    />
                    <span className="justify-self-start">{title}</span>
                    <span className="text-muted-foreground text-xs">[{size} bytes]</span>
                </div>
            </button>
            {expanded && (
                <div className="mt-1 ml-6 space-y-1">
                    {values.map((val, idx) => (
                        <div
                            key={idx}
                            className="text-muted-foreground border-border border-l pl-4 text-xs"
                        >
                            <span className="text-accent-foreground">{val.name}</span>: {val.value}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const NoPacketSelected = (props: ComponentPropsWithoutRef<'div'>) => {
    const { className, ...rest } = props
    return (
        <div
            className={cn(
                'bg-card rounded-lg p-4',
                'font-mono text-sm',
                'scrollbar-thin h-full overflow-auto',
                className,
            )}
            {...rest}
        >
            <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
                Packet Structure
            </div>
            <div className="text-muted-foreground text-sm">No packet selected.</div>
        </div>
    )
}

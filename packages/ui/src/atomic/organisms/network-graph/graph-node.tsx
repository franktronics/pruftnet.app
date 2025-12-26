import { Popover, PopoverTrigger, PopoverContent, Button } from '../../atoms'
import { Computer } from 'lucide-react'
import { type NodeProps, type Node } from '@xyflow/react'
import { cn } from '@repo/utils'
import { GraphHandle } from './graph-handle'

export type DeviceNodeData = Node<{
    mac: string
}>
export type GraphDeviceNodeProps = {
    className?: string
} & NodeProps<DeviceNodeData>

export const GraphDeviceNode = (props: GraphDeviceNodeProps) => {
    const { className, data } = props
    const { mac } = data

    return (
        <Popover>
            <PopoverTrigger className={className} aria-label={'Device: ' + mac} asChild>
                <Button
                    variant="outline"
                    size="icon"
                    className="relative size-12.5 rounded-full"
                    tabIndex={0}
                >
                    <Computer className="size-6" />
                    <GraphHandle
                        className={cn(
                            'h-2.75 w-2.75 rounded-full transition',
                            'border-input! bg-secondary! border',
                        )}
                    />
                    <p className="absolute top-[calc(100%+0.5rem)]">{mac}</p>
                </Button>
            </PopoverTrigger>
            <PopoverContent>test</PopoverContent>
        </Popover>
    )
}

import { Popover, PopoverTrigger, PopoverContent, Button } from '../../atoms'
import { Computer } from 'lucide-react'
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'

export type DeviceNodeData = Node<{
    mac: string
    vendor?: string
}>
export type GraphDeviceNodeProps = {
    className?: string
} & NodeProps<DeviceNodeData>

export const GraphDeviceNode = (props: GraphDeviceNodeProps) => {
    const { className, data } = props
    const { mac, vendor } = data

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
                    <Handle type="source" position={Position.Top} className="hidden" />
                    <p className="absolute top-[calc(100%+0.5rem)]">
                        <span>{mac}</span>
                        <span>{vendor ? vendor.slice(0, 10) : ''}</span>
                    </p>
                </Button>
            </PopoverTrigger>
            <PopoverContent>test</PopoverContent>
        </Popover>
    )
}

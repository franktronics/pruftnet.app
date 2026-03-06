import { Popover, PopoverTrigger, PopoverContent, Button } from '../../atoms'
import { Computer } from 'lucide-react'
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'
import { cond } from '@repo/utils'

export type DeviceNodeData = Node<{
    mac: string
    vendor?: string
    ipv4?: string
    ipv6?: string
}>
export type GraphDeviceNodeProps = {
    className?: string
} & NodeProps<DeviceNodeData>

export const GraphDeviceNode = (props: GraphDeviceNodeProps) => {
    const { className, data } = props
    const { mac, vendor, ipv4, ipv6 } = data

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
                    <p className="absolute top-[calc(100%+0.5rem)] flex flex-col">
                        <span>{cond([!!ipv4, ipv4], [!!ipv6, ipv6], [!!mac, mac])}</span>
                        <span>{vendor ? vendor.slice(0, 10) : ''}</span>
                    </p>
                </Button>
            </PopoverTrigger>
            <PopoverContent>
                <div className="flex flex-col gap-1">
                    {vendor?.split('\n').map((line) => (
                        <span key={line}>{line}</span>
                    ))}
                </div>
                <div className="flex flex-col gap-1">{JSON.stringify(data)}</div>
            </PopoverContent>
        </Popover>
    )
}

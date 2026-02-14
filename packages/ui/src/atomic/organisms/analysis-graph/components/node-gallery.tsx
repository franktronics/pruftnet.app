import { useReactFlow } from '@xyflow/react'
import { Plus, Radar, Network, Database, Popsicle, Radio, RadioTower, Loader } from 'lucide-react'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle, Button } from '../../../atoms'
import { cn } from '@repo/utils'
import { ReactNode } from 'react'

export type NodeGalleryProps = {
    onOpenChange?: (open: boolean) => void
}

type NodeType = {
    type: string
    label: string
    description: string
    icon: ReactNode
}

const nodeTypes: NodeType[] = [
    {
        type: 'net-source',
        label: 'Network Source',
        description: 'Starting point for network analysis',
        icon: <Network className="size-5" />,
    },
    {
        type: 'net-output',
        label: 'Network Output',
        description: 'Output endpoint for analysis results',
        icon: <Database className="size-5" />,
    },
    {
        type: 'ip-range',
        label: 'IP Range',
        description: 'Define a range of IP addresses',
        icon: <Database className="size-5" />,
    },
    {
        type: 'ip-single',
        label: 'Single IP',
        description: 'Define a single IP address',
        icon: <Database className="size-5" />,
    },
    {
        type: 'arp-scan',
        label: 'ARP Scan',
        description: 'Scan network using ARP protocol',
        icon: <Radar className="size-5" />,
    },
    {
        type: 'icmp-ping',
        label: 'ICMP Ping',
        description: 'Ping a host using ICMP protocol',
        icon: <Popsicle className="size-5" />,
    },
    {
        type: 'ipv6-single',
        label: 'Single IPv6',
        description: 'Define a single IPv6 address',
        icon: <Database className="size-5" />,
    },
    {
        type: 'ipv6-ns',
        label: 'IPv6 NS',
        description: 'Perform IPv6 Neighbor Solicitation',
        icon: <Radio className="size-5" />,
    },
    {
        type: 'ipv6-rs',
        label: 'IPv6 RS',
        description: 'Send IPv6 Router Solicitation',
        icon: <RadioTower className="size-5" />,
    },
    {
        type: 'icmpv6-ping',
        label: 'ICMPv6 Ping',
        description: 'Ping a host using ICMPv6 protocol',
        icon: <Popsicle className="size-5" />,
    },
    {
        type: 'wait-for',
        label: 'Wait For',
        description: 'Delay transmission until secondary input receives data',
        icon: <Loader className="size-5" />,
    },
]

export const NodeGallery = (props: NodeGalleryProps) => {
    const { onOpenChange } = props
    const { addNodes } = useReactFlow()

    const handleAddNode = (node: NodeType) => {
        const nodeId = `${node.type}-${Date.now()}`
        const newNode = {
            id: nodeId,
            type: node.type,
            position: { x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400 },
            data: {
                name: `${node.type}-node`,
            },
        }

        addNodes(newNode)
        onOpenChange?.(false)
    }

    return (
        <SheetContent side="right">
            <SheetHeader>
                <SheetTitle>Node Gallery</SheetTitle>
                <SheetDescription>
                    Add nodes to your network analysis graph by clicking the Add button
                </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 px-2">
                {nodeTypes.map((node) => (
                    <div
                        key={node.type}
                        className={cn(
                            'border-border bg-card hover:bg-accent/50 group flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors',
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                                {node.icon}
                            </div>
                            <div className="flex flex-col gap-1">
                                <h3 className="text-foreground font-medium">{node.label}</h3>
                                <p className="text-muted-foreground text-sm">{node.description}</p>
                            </div>
                        </div>
                        <Button size="sm" onClick={() => handleAddNode(node)} className="shrink-0">
                            <Plus className="mr-1 size-4" />
                            Add
                        </Button>
                    </div>
                ))}
            </div>
        </SheetContent>
    )
}

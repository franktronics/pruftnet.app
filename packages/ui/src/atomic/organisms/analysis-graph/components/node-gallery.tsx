import { useReactFlow } from '@xyflow/react'
import { Plus, Radar, Network, Database } from 'lucide-react'
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../atoms/sheet/sheet'
import { Button } from '../../../atoms/button/button'
import { cn } from '@repo/utils'

export type NodeGalleryProps = {
    onOpenChange?: (open: boolean) => void
}

type NodeType = {
    type: string
    label: string
    description: string
    icon: React.ReactNode
    preview: React.ReactNode
}

const nodeTypes: NodeType[] = [
    {
        type: 'net-source',
        label: 'Network Source',
        description: 'Starting point for network analysis',
        icon: <Network className="size-4" />,
        preview: (
            <div className="bg-background border-border flex items-center gap-2 rounded-l-4xl rounded-r-lg border p-2">
                <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Network className="size-5" />
                </div>
            </div>
        ),
    },
    {
        type: 'ip-range',
        label: 'IP Range',
        description: 'Define a range of IP addresses',
        icon: <Database className="size-4" />,
        preview: (
            <div className="bg-background border-border flex flex-col gap-1 rounded-l-2xl border p-2">
                <div className="flex items-center gap-2">
                    <div className="bg-chart-2/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-2 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">xxx.xxx.xxx.xxx</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-chart-5/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-5 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">xxx.xxx.xxx.xxx</p>
                </div>
            </div>
        ),
    },
    {
        type: 'arp-scan',
        label: 'ARP Scan',
        description: 'Scan network using ARP protocol',
        icon: <Radar className="size-4" />,
        preview: (
            <div className="bg-background border-border flex items-center gap-2 border p-2">
                <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Radar className="size-5" />
                </div>
                <div className="text-sm">ARP</div>
            </div>
        ),
    },
    {
        type: 'net-output',
        label: 'Network Output',
        description: 'Output endpoint for analysis results',
        icon: <Database className="size-4" />,
        preview: (
            <div className="bg-background border-border flex items-center gap-2 rounded-l-lg rounded-r-4xl border p-2">
                <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Database className="size-5" />
                </div>
            </div>
        ),
    },
]

export const NodeGallery = (props: NodeGalleryProps) => {
    const { onOpenChange } = props
    const { addNodes } = useReactFlow()

    const handleAddNode = (type: string) => {
        const nodeId = `${type}-${Date.now()}`
        const newNode = {
            id: nodeId,
            type: type,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
            data: {
                name: `${type}-node`,
                icon: nodeTypes.find((n) => n.type === type)?.icon,
            },
        }

        addNodes(newNode)
        onOpenChange?.(false)
    }

    return (
        <SheetContent side="right" className="w-100 sm:w-110">
            <SheetHeader>
                <SheetTitle>Node Gallery</SheetTitle>
                <SheetDescription>
                    Add nodes to your network analysis graph by clicking the Add button
                </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-2">
                {nodeTypes.map((node) => (
                    <div
                        key={node.type}
                        className={cn(
                            'border-border bg-card hover:bg-accent/50 group rounded-lg border p-4 transition-colors',
                        )}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex flex-1 flex-col gap-3">
                                <div className="flex items-center gap-2">
                                    <div className="text-primary">{node.icon}</div>
                                    <h3 className="text-foreground font-medium">{node.label}</h3>
                                </div>
                                <p className="text-muted-foreground text-sm">{node.description}</p>
                                <div className="flex items-center justify-center rounded-md p-2">
                                    {node.preview}
                                </div>
                            </div>
                            <Button
                                size="sm"
                                onClick={() => handleAddNode(node.type)}
                                className="shrink-0"
                            >
                                <Plus className="mr-1 size-4" />
                                Add
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </SheetContent>
    )
}

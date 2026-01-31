import { ComponentProps, useCallback, useState } from 'react'
import {
    ReactFlow,
    addEdge,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    type ReactFlowInstance,
    type ReactFlowJsonObject,
    Panel,
} from '@xyflow/react'
import { LayoutGrid, Plus } from 'lucide-react'
import { AnalysisGraphEdge } from './components/graph-edge'
import { NetworkSource } from './nodes/network-source'
import { NetworkOutput } from './nodes/network-output'
import { IpRange, ArpScan } from './nodes'
import { NodeGallery, GraphControls, checkConnection } from './components'
import { Sheet, SheetTrigger } from '../../atoms/sheet/sheet'
import { Button } from '../../atoms/button/button'

const edgeTypes = {
    connect: AnalysisGraphEdge,
}
const nodeTypes = {
    'net-source': NetworkSource,
    'net-output': NetworkOutput,
    'ip-range': IpRange,
    'arp-scan': ArpScan,
}

export type AnalysisGraphProps = {
    initialNodes?: Node[]
    initialEdges?: Edge[]
    onSave?: (instance: ReactFlowJsonObject<Node, Edge>) => void | Promise<void>
} & ComponentProps<'div'>
export const AnalysisGraph = (props: AnalysisGraphProps) => {
    const { initialNodes = [], initialEdges = [], onSave, ...rest } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [isGalleryOpen, setIsGalleryOpen] = useState(false)
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)

    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [])

    const handleSave = useCallback(() => {
        if (rfInstance && onSave) {
            const flow = rfInstance.toObject()
            onSave(flow)
        }
    }, [rfInstance])

    return (
        <div {...rest}>
            <Sheet open={isGalleryOpen} onOpenChange={setIsGalleryOpen}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    fitView={true}
                    proOptions={{ hideAttribution: true }}
                    snapToGrid={true}
                    snapGrid={[16, 16]}
                    isValidConnection={checkConnection}
                    onInit={setRfInstance}
                >
                    <GraphControls />
                    <Background gap={16} />
                    <Panel position="top-right" className="flex items-center gap-2">
                        <SheetTrigger asChild>
                            <Button size="sm" variant="outline" className="shadow-md">
                                <Plus className="size-4" />
                                Add Node
                            </Button>
                        </SheetTrigger>
                        <Button
                            size="sm"
                            variant="default"
                            onClick={handleSave}
                            className="shadow-md"
                        >
                            Save
                        </Button>
                    </Panel>
                </ReactFlow>
                <NodeGallery onOpenChange={setIsGalleryOpen} />
            </Sheet>
        </div>
    )
}

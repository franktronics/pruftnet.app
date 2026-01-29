import { ComponentProps, useCallback, useState } from 'react'
import {
    ReactFlow,
    addEdge,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    Panel,
} from '@xyflow/react'
import { LayoutGrid } from 'lucide-react'
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
} & ComponentProps<'div'>
export const AnalysisGraph = (props: AnalysisGraphProps) => {
    const { initialNodes = [], initialEdges = [], ...rest } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const [isGalleryOpen, setIsGalleryOpen] = useState(false)

    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [])

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
                >
                    <GraphControls />
                    <Background gap={16} />
                    <Panel position="top-right">
                        <SheetTrigger asChild>
                            <Button size="icon" variant="outline" className="shadow-md">
                                <LayoutGrid className="size-4" />
                            </Button>
                        </SheetTrigger>
                    </Panel>
                </ReactFlow>
                <NodeGallery onOpenChange={setIsGalleryOpen} />
            </Sheet>
        </div>
    )
}

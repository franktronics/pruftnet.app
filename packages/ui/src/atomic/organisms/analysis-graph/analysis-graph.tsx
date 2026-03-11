import { ComponentProps, useCallback, useEffect, useState } from 'react'
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
    useReactFlow,
} from '@xyflow/react'
import { Plus } from 'lucide-react'
import { NodeGallery, GraphControls, checkConnection, GraphProvider } from './components'
import { Drawer, DrawerTrigger } from '../../atoms/drawer/drawer'
import { Button } from '../../atoms/button/button'
import { edgeTypes, nodeTypes } from './graph-config'

export type AnalysisGraphProps = {
    initialNodes: Node[]
    initialEdges: Edge[]
    initialViewport: { x: number; y: number; zoom: number }
    analysisId: number
    onSave: (instance: ReactFlowJsonObject<Node, Edge>) => void | Promise<void>
    isSaving: boolean
} & ComponentProps<'div'>
export const AnalysisGraph = (props: AnalysisGraphProps) => {
    const { initialNodes, initialEdges, initialViewport, analysisId, onSave, isSaving, ...rest } =
        props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const { setViewport } = useReactFlow()

    const [isGalleryOpen, setIsGalleryOpen] = useState(false)
    const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)

    useEffect(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
        setViewport(initialViewport)
    }, [analysisId])

    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [])

    const handleSave = useCallback(() => {
        if (rfInstance && onSave) {
            const flow = rfInstance.toObject()
            onSave(flow)
        }
    }, [rfInstance])

    return (
        <div {...rest}>
            <Drawer open={isGalleryOpen} onOpenChange={setIsGalleryOpen} direction="right">
                <GraphProvider>
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
                            <DrawerTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="shadow-md"
                                    disabled={isSaving}
                                >
                                    <Plus className="size-4" />
                                    Add Node
                                </Button>
                            </DrawerTrigger>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={handleSave}
                                className="shadow-md"
                                disabled={isSaving}
                            >
                                Save
                            </Button>
                        </Panel>
                    </ReactFlow>
                </GraphProvider>
                <NodeGallery onOpenChange={setIsGalleryOpen} />
            </Drawer>
        </div>
    )
}

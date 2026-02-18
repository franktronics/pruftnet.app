import { ComponentProps, useEffect } from 'react'
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
    useReactFlow,
} from '@xyflow/react'
import { GraphControls, GraphProvider } from './components'
import { edgeTypes, nodeTypes } from './graph-config'
import { cn } from '@repo/utils'

export type AnalysisWorkflowGraphProps = {
    initialNodes: Node[]
    initialEdges: Edge[]
    initialViewport: { x: number; y: number; zoom: number }
    analysisId: number
    dataAvailable: boolean
} & ComponentProps<'div'>

export const AnalysisWorkflowGraph = (props: AnalysisWorkflowGraphProps) => {
    const {
        initialNodes,
        initialEdges,
        initialViewport,
        analysisId,
        dataAvailable,
        className,
        ...rest
    } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges] = useEdgesState(initialEdges)
    const { setViewport } = useReactFlow()

    useEffect(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
        setViewport({ x: 0, y: 0, zoom: 1 })
    }, [analysisId])

    return (
        <div className={cn('h-full', className)} {...rest}>
            {dataAvailable ? (
                <GraphProvider viewOnly={true}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        fitView={true}
                        snapToGrid={true}
                        snapGrid={[16, 16]}
                        proOptions={{ hideAttribution: true }}
                    >
                        <GraphControls />
                        <Background gap={16} />
                    </ReactFlow>
                </GraphProvider>
            ) : null}
            {!dataAvailable ? (
                <div className="flex h-full items-center justify-center">
                    <p className="text-muted-foreground text-center text-lg">
                        Start by adding an analysis workflow.
                    </p>
                </div>
            ) : null}
        </div>
    )
}

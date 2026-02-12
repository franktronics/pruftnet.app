import { ComponentProps, useEffect } from 'react'
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
} from '@xyflow/react'
import { GraphControls, GraphProvider } from './components'
import { edgeTypes, nodeTypes } from './graph-config'

export type AnalysisWorkflowGraphProps = {
    initialNodes: Node[]
    initialEdges: Edge[]
    analysisId: number
    dataAvailable: boolean
} & ComponentProps<'div'>

export const AnalysisWorkflowGraph = (props: AnalysisWorkflowGraphProps) => {
    const { initialNodes, initialEdges, analysisId, dataAvailable, ...rest } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges] = useEdgesState(initialEdges)

    useEffect(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
    }, [analysisId])

    return (
        <div {...rest}>
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

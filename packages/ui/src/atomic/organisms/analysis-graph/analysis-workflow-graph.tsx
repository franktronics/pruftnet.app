import { ComponentProps, useEffect } from 'react'
import {
    ReactFlow,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
} from '@xyflow/react'
import { GraphControls } from './components'
import { edgeTypes, nodeTypes } from './graph-config'

export type AnalysisWorkflowGraphProps = {
    initialNodes: Node[]
    initialEdges: Edge[]
    analysisId: number
} & ComponentProps<'div'>
export const AnalysisWorkflowGraph = (props: AnalysisWorkflowGraphProps) => {
    const { initialNodes, initialEdges, analysisId, ...rest } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

    useEffect(() => {
        setNodes(initialNodes)
        setEdges(initialEdges)
    }, [analysisId])

    return (
        <div {...rest}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView={true}
                snapToGrid={true}
                snapGrid={[16, 16]}
                proOptions={{ hideAttribution: true }}
            >
                <GraphControls />
                <Background gap={16} />
            </ReactFlow>
        </div>
    )
}

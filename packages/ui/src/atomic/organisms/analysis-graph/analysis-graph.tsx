import { ComponentProps, useCallback } from 'react'
import {
    ReactFlow,
    addEdge,
    Background,
    useNodesState,
    useEdgesState,
    ConnectionMode,
    type Node,
    type Edge,
} from '@xyflow/react'
import { GraphControls } from './graph-controls'
import { AnalysisGraphEdge } from './graph-edge'
import { AnalysisGraphNode } from './graph-node'

const edgeTypes = {
    connect: AnalysisGraphEdge,
}
const nodeTypes = {
    source: AnalysisGraphNode,
}

export type AnalysisGraphProps = {} & ComponentProps<'div'>
export const AnalysisGraph = (props: AnalysisGraphProps) => {
    const { ...rest } = props
    const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
    const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [])

    return (
        <div {...rest}>
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
                connectionMode={ConnectionMode.Loose}
            >
                <GraphControls />
                <Background />
            </ReactFlow>
        </div>
    )
}

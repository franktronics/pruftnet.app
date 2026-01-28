import { ComponentProps, useCallback } from 'react'
import {
    ReactFlow,
    addEdge,
    Background,
    useNodesState,
    useEdgesState,
    type Node,
    type Edge,
} from '@xyflow/react'
import { GraphControls } from './graph-controls'
import { AnalysisGraphEdge } from './graph-edge'
import { NetworkSource } from './nodes/network-source'
import { NetworkOutput } from './nodes/network-output'
import { IpRange, ArpScan } from './nodes'
import { checkConnection } from './connection-checker'

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
                snapToGrid={true}
                snapGrid={[16, 16]}
                isValidConnection={checkConnection}
            >
                <GraphControls />
                <Background gap={16} />
            </ReactFlow>
        </div>
    )
}

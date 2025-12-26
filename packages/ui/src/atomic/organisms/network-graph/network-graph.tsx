import { type ComponentPropsWithoutRef, useCallback } from 'react'
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
import { GraphDeviceNode } from './graph-node'
import { GraphDeviceEdge } from './graph-edge'
import { GraphControls } from './graph-controls'

export type NetworkGraphProps = {} & ComponentPropsWithoutRef<'div'>

const nodeTypes = {
    device: GraphDeviceNode,
}
const edgeTypes = {
    exchange: GraphDeviceEdge,
}

const initialNodes: Node[] = [
    {
        id: 'd1',
        position: { x: -200, y: -100 },
        type: 'device',
        data: { mac: 'D1:1A:2B:3C:4D:5E' },
    },
    { id: 'd2', position: { x: 0, y: 0 }, type: 'device', data: { mac: 'D2:22:33:44:55:66' } },
]
const initialEdges: Edge[] = [
    {
        id: 'd1->d2',
        type: 'exchange',
        source: 'd1',
        target: 'd2',
        animated: true,
        markerEnd: { type: 'arrowclosed' },
    },
]

export const NetworkGraph = (props: NetworkGraphProps) => {
    const { ...rest } = props

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
                connectionMode={ConnectionMode.Loose}
            >
                <GraphControls />
                <Background />
            </ReactFlow>
        </div>
    )
}

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
import { useForceLayout } from './use-force-layout'

export type NetworkGraphProps = {
    forceStrength?: number
    forceDistance?: number
    enableForceLayout?: boolean
    alphaDecay?: number
    velocityDecay?: number
} & ComponentPropsWithoutRef<'div'>

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
    {
        id: 'd3',
        position: { x: 200, y: -100 },
        type: 'device',
        data: { mac: 'D3:33:44:55:66:77' },
    },
    {
        id: 'd4',
        position: { x: 100, y: 100 },
        type: 'device',
        data: { mac: 'D4:44:55:66:77:88' },
    },
    {
        id: 'd5',
        position: { x: -100, y: 100 },
        type: 'device',
        data: { mac: 'D5:55:66:77:88:99' },
    },
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
    {
        id: 'd2->d3',
        type: 'exchange',
        source: 'd2',
        target: 'd3',
        animated: true,
        markerEnd: { type: 'arrowclosed' },
    },
    {
        id: 'd2->d4',
        type: 'exchange',
        source: 'd2',
        target: 'd4',
        animated: true,
        markerEnd: { type: 'arrowclosed' },
    },
    {
        id: 'd1->d5',
        type: 'exchange',
        source: 'd1',
        target: 'd5',
        animated: true,
        markerEnd: { type: 'arrowclosed' },
    },
    {
        id: 'd3->d4',
        type: 'exchange',
        source: 'd3',
        target: 'd4',
        animated: true,
        markerEnd: { type: 'arrowclosed' },
    },
]

export const NetworkGraph = (props: NetworkGraphProps) => {
    const {
        forceStrength = -100,
        forceDistance = 100,
        enableForceLayout = true,
        alphaDecay,
        velocityDecay,
        ...rest
    } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
    const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [])

    const { fixNodePosition, releaseNodePosition, updateNodePosition } = useForceLayout(
        nodes,
        edges,
        setNodes,
        {
            strength: forceStrength,
            distance: forceDistance,
            enabled: enableForceLayout,
            alphaDecay,
            velocityDecay,
        },
    )

    const onNodeDragStart = useCallback(
        (_: any, node: Node) => {
            fixNodePosition(node.id, node.position.x, node.position.y)
        },
        [fixNodePosition],
    )

    const onNodeDrag = useCallback(
        (_: any, node: Node) => {
            updateNodePosition(node.id, node.position.x, node.position.y)
        },
        [updateNodePosition],
    )

    const onNodeDragStop = useCallback(
        (_: any, node: Node) => {
            releaseNodePosition(node.id)
        },
        [releaseNodePosition],
    )

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
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
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

import { type ComponentPropsWithoutRef, useCallback, useEffect } from 'react'
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
    injectedNodes?: Node[]
    injectedEdges?: Edge[]
} & ComponentPropsWithoutRef<'div'>

const nodeTypes = {
    unknown: GraphDeviceNode,
}
const edgeTypes = {
    exchange: GraphDeviceEdge,
}

export const NetworkGraph = (props: NetworkGraphProps) => {
    const {
        forceStrength = -100,
        forceDistance = 100,
        enableForceLayout = true,
        alphaDecay,
        velocityDecay,
        injectedNodes = [],
        injectedEdges = [],
        ...rest
    } = props

    const [nodes, setNodes, onNodesChange] = useNodesState(injectedNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(injectedEdges)
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

    useEffect(() => {
        setNodes(injectedNodes)
        setEdges(injectedEdges)
    }, [injectedNodes, injectedEdges])

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

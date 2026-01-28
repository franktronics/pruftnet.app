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
import { EthernetPort, Network } from 'lucide-react'
import { NetworkOutput } from './nodes/network-output'
import { IpRange, ArpScan } from './nodes'

const edgeTypes = {
    connect: AnalysisGraphEdge,
}
const nodeTypes = {
    'net-source': NetworkSource,
    'net-output': NetworkOutput,
    'ip-range': IpRange,
    'arp-scan': ArpScan,
}

const initialNodes: Node[] = [
    {
        id: 'network-source',
        position: { x: -400, y: 0 },
        type: 'net-source',
        data: { name: 'Network Source', icon: <Network /> },
    },
    {
        id: 'network-output',
        position: { x: 400, y: 0 },
        type: 'net-output',
        data: { name: 'Network Output', icon: <EthernetPort /> },
    },
    {
        id: 'ip-range',
        position: { x: 0, y: -200 },
        type: 'ip-range',
        data: { name: 'ARP Ip range', startIp: '', endIp: '' },
    },
    {
        id: 'arp-scan',
        position: { x: 0, y: 200 },
        type: 'arp-scan',
        data: { name: 'ARP Scan', delay: 0 },
    },
]

export type AnalysisGraphProps = {} & ComponentProps<'div'>
export const AnalysisGraph = (props: AnalysisGraphProps) => {
    const { ...rest } = props
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as Node[])
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
                snapToGrid={true}
                snapGrid={[16, 16]}
            >
                <GraphControls />
                <Background gap={16} />
            </ReactFlow>
        </div>
    )
}

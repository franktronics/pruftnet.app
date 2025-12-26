import type { EdgeProps, Node, Edge } from '@xyflow/react'
import { getBezierPath, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'
import { getEdgeParams } from './graph-utils'

export type DeviceEdgeData<T extends Node = Node> = Edge<{
    /**
     * The key to lookup in the source node's `data` object. For additional safety,
     * you can parameterize the `DataEdge` over the type of one of your nodes to
     * constrain the possible values of this key.
     *
     * If no key is provided this edge behaves identically to React Flow's default
     * edge component.
     */
    key?: keyof T['data']
}>

export const GraphDeviceEdge = (props: EdgeProps<DeviceEdgeData>) => {
    const { id, style, markerEnd, markerStart, source, target } = props
    const sourceNode = useInternalNode(source)
    const targetNode = useInternalNode(target)

    if (!sourceNode || !targetNode) {
        return null
    }

    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode)

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX: sx,
        sourceY: sy,
        targetX: tx,
        targetY: ty,
        sourcePosition: sourcePos,
        targetPosition: targetPos,
    })

    return (
        <>
            <path
                id={id}
                className="react-flow__edge-path"
                d={edgePath}
                markerEnd={markerEnd}
                markerStart={markerStart}
                style={style}
            />
            <EdgeLabelRenderer>
                <div
                    className="bg-background text-foreground absolute rounded border px-1"
                    style={{
                        transform: `translate(${labelX}px,${labelY}px) translate(-50%, -50%)`,
                    }}
                >
                    <pre className="text-xs">2</pre>
                </div>
            </EdgeLabelRenderer>
        </>
    )
}

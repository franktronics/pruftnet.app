import { getEdgeParams } from '@repo/utils'
import type { EdgeProps, Edge } from '@xyflow/react'
import { getBezierPath, EdgeLabelRenderer, useInternalNode } from '@xyflow/react'

export type DeviceEdgeData = Edge<{
    numPackets: number
}>

export const GraphDeviceEdge = (props: EdgeProps<DeviceEdgeData>) => {
    const { id, style, markerEnd, markerStart, source, target, data } = props
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
                    <pre className="text-xs">{data?.numPackets || ''}</pre>
                </div>
            </EdgeLabelRenderer>
        </>
    )
}

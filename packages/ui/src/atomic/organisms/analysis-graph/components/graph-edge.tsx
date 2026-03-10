import { getEdgeParams } from '@repo/utils'
import type { EdgeProps, Node, Edge } from '@xyflow/react'
import { getBezierPath, useInternalNode } from '@xyflow/react'

export type AnalysisGraphEdgeData<T extends Node = Node> = Edge<{
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

export const AnalysisGraphEdge = (props: EdgeProps<AnalysisGraphEdgeData>) => {
    const { id, style, markerEnd, markerStart, source, target } = props
    const sourceNode = useInternalNode(source)
    const targetNode = useInternalNode(target)

    if (!sourceNode || !targetNode) {
        return null
    }

    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode)

    const [edgePath] = getBezierPath({
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
        </>
    )
}

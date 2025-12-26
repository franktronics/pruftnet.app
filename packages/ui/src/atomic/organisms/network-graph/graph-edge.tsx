import type { EdgeProps, Node, Edge } from '@xyflow/react'
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react'

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
    const {
        id,
        markerEnd,
        markerStart,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    } = props

    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    })

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} markerStart={markerStart} />
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

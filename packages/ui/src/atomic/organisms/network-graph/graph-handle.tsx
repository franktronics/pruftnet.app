import { Position, Handle } from '@xyflow/react'

export type GraphHandleProps = {
    className?: string
}
export const GraphHandle = (props: GraphHandleProps) => {
    const { className } = props

    return (
        <>
            <Handle type="source" position={Position.Top} className={className} />
            <Handle type="source" position={Position.Right} className={className} />
            <Handle type="source" position={Position.Bottom} className={className} />
            <Handle type="source" position={Position.Left} className={className} />
        </>
    )
}

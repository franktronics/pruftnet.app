import { cn } from '@repo/utils'
import { Handle, Position } from '@xyflow/react'
import { ComponentProps } from 'react'
import { useNodeContext } from '../nodes-layout/node-layout-context'

export type NodeHandle = {
    position?: Position
} & Omit<ComponentProps<typeof Handle>, 'position'>
export const NodeHandle = (props: NodeHandle) => {
    const { className, position, type, ...rest } = props

    const { nodeId, nodeType } = useNodeContext()

    const pos = position || (type === 'source' ? Position.Right : Position.Left)

    return (
        <Handle
            position={pos}
            type={type}
            style={{
                background: 'none',
                border: 'none',
                width: '0.75em',
                height: '0.75em',
            }}
            className="flex items-center justify-center"
            id={`handle/${nodeType}/${nodeId}/${type}/${pos}`}
            {...rest}
        >
            <div
                className={cn(
                    'border-background bg-primary border-2',
                    'pointer-events-none size-3 rounded-full',
                    className,
                )}
            ></div>
        </Handle>
    )
}

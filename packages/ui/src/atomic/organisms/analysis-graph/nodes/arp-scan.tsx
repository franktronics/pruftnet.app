import { type ComponentProps } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from './node-layout'

export type ArpScanNodeData = Node<{ name: string }>
export type ArpScanProps = {} & NodeProps<ArpScanNodeData> & ComponentProps<'div'>

export const ArpScan = (props: ArpScanProps) => {
    const { selected = false, data, className, ...rest } = props
    const { name } = data

    return (
        <NodeLayout name={name} selected={selected} className={className} {...rest}>
            <Handle
                position={Position.Left}
                type="target"
                style={{
                    background: 'none',
                    border: 'none',
                    width: '0.75em',
                    height: '0.75em',
                }}
            >
                <div
                    className={cn(
                        'border-background bg-primary border-2',
                        'pointer-events-none size-3 rounded-full',
                        'absolute -left-0.5',
                    )}
                ></div>
            </Handle>

            <div>test</div>

            <Handle
                position={Position.Right}
                type="source"
                style={{
                    background: 'none',
                    border: 'none',
                    width: '0.75em',
                    height: '0.75em',
                }}
            >
                <div
                    className={cn(
                        'border-background bg-primary border-2',
                        'pointer-events-none size-3 rounded-full',
                        'absolute -right-0.5',
                    )}
                ></div>
            </Handle>
        </NodeLayout>
    )
}

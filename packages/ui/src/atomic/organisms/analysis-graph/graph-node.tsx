import { Button } from '../../atoms'
import { Computer } from 'lucide-react'
import { type NodeProps, type Node, Handle, Position } from '@xyflow/react'

export type AnalysisNodeData = Node<{
    name: string
}>
export type AnalysisGraphNodeProps = {
    className?: string
} & NodeProps<AnalysisNodeData>

export const AnalysisGraphNode = (props: AnalysisGraphNodeProps) => {
    const { className, data } = props
    const { name } = data

    return (
        <Button
            variant="outline"
            size="icon"
            className="relative size-12.5 rounded-full"
            tabIndex={0}
        >
            <Computer className="size-6" />
            <Handle type="source" position={Position.Right} className="hidden" />
            <p className="absolute top-[calc(100%+0.5rem)]">{name}</p>
        </Button>
    )
}

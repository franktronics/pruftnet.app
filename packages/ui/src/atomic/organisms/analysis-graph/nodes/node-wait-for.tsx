import { Position, type Node, type NodeProps } from '@xyflow/react'
import { z } from 'zod'
import { cn } from '@repo/utils'
import { InfoIcon, Loader } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'
import { Alert, AlertDescription, AlertTitle } from '../../../atoms'

const paramFormSchema = z.object({})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type WaitForNodeData = Node<ParamFormValues & BasicNodeData, 'wait-for'>
export type WaitForProps = {
    className?: string
} & NodeProps<WaitForNodeData>

export const NodeWaitFor = (props: WaitForProps) => {
    const { selected = false, className } = props

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block>
                <NodeHandle type="target" />
                <NodeHandle type="target" position={Position.Top} />
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-primary/10 text-primary rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Loader className="size-5" />
                    </div>
                    <div>Wait For</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="Wait For Settings">
                <NodeLayout.Params disabled={false}>
                    <Alert>
                        <InfoIcon />
                        <AlertTitle>What is this node for</AlertTitle>
                        <AlertDescription>
                            This node is used to delay the transmission of information until its
                            secondary input has received data.
                        </AlertDescription>
                    </Alert>
                </NodeLayout.Params>
                <NodeLayout.Settings disabled={true}></NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

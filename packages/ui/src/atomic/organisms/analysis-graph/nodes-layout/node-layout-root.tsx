import { type ComponentProps } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { NodeProvider } from './node-layout-context'
import { ContextMenu } from '../../../atoms'
import { NodeStatus } from '../nodes/utils'

type NodeLayoutRootProps = {
    data: NodeProps<Node<{ name: string; status?: NodeStatus }, string>>
    selected: boolean
} & ComponentProps<'div'>
const Root = (props: NodeLayoutRootProps) => {
    const { children, data, selected, ...rest } = props

    return (
        <NodeProvider
            name={data.data.name}
            nodeId={data.id}
            nodeType={data.type}
            selected={selected}
            status={data.data.status}
        >
            <ContextMenu>
                <div {...rest}>{children}</div>
            </ContextMenu>
        </NodeProvider>
    )
}

export { Root, type NodeLayoutRootProps }

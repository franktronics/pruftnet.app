import { type ComponentProps } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { NodeProvider } from './node-layout-context'
import { ContextMenu } from '../../../atoms'

type NodeLayoutRootProps = {
    data: NodeProps<Node<{ name: string }>>
    selected: boolean
} & ComponentProps<'div'>
const Root = (props: NodeLayoutRootProps) => {
    const { children, data, selected, ...rest } = props

    return (
        <NodeProvider name={data.data.name} nodeId={data.id} selected={selected}>
            <ContextMenu>
                <div {...rest}>{children}</div>
            </ContextMenu>
        </NodeProvider>
    )
}

export { Root, type NodeLayoutRootProps }

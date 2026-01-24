import { type ComponentProps } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { NodeProvider, useNodeContext } from './node-layout-context'
import { DropdownMenu } from '../../../atoms'

type NodeLayoutRootProps = {
    data: NodeProps<Node<{ name: string }>>
    selected: boolean
} & ComponentProps<'div'>
const Root = (props: NodeLayoutRootProps) => {
    const { children, data, selected, ...rest } = props

    return (
        <NodeProvider name={data.data.name} selected={selected}>
            <RootWrapper>
                <div {...rest}>{children}</div>
            </RootWrapper>
        </NodeProvider>
    )
}

const RootWrapper = (props: ComponentProps<typeof DropdownMenu>) => {
    const { children, ...rest } = props
    const { menuOpen, setMenuOpen } = useNodeContext()

    return (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} {...rest}>
            {children}
        </DropdownMenu>
    )
}

export { Root, type NodeLayoutRootProps }

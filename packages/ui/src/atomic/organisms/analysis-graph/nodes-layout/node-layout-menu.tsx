import { ComponentProps } from 'react'
import {
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
} from '../../../atoms/context-menu'
import { useNodeContext } from './node-layout-context'
import { useReactFlow } from '@xyflow/react'

type NodeLayoutMenuProps = {} & ComponentProps<typeof ContextMenuContent>
const Menu = (props: NodeLayoutMenuProps) => {
    const { children, className, ...rest } = props
    const { setRenamePopupOpen, setPopupOpen, nodeId } = useNodeContext()
    const { setNodes } = useReactFlow()

    const handleDeleteBtnClick = () => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId))
    }

    return (
        <ContextMenuContent className="w-48" {...rest}>
            <ContextMenuGroup>
                <ContextMenuItem onClick={() => setPopupOpen(true)}>Open</ContextMenuItem>
                <ContextMenuItem onClick={() => setRenamePopupOpen(true)}>Rename</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem onClick={handleDeleteBtnClick}>Delete</ContextMenuItem>
            </ContextMenuGroup>
            {children}
        </ContextMenuContent>
    )
}

export { Menu, type NodeLayoutMenuProps }

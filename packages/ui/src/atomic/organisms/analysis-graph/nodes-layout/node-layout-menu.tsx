import { ComponentProps } from 'react'
import {
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
} from '../../../atoms/context-menu'
import { useNodeContext } from './node-layout-context'

type NodeLayoutMenuProps = {} & ComponentProps<typeof ContextMenuContent>
const Menu = (props: NodeLayoutMenuProps) => {
    const { children, className, ...rest } = props
    const { setRenamePopupOpen, setPopupOpen } = useNodeContext()

    return (
        <ContextMenuContent className="w-48" {...rest}>
            <ContextMenuGroup>
                <ContextMenuItem onClick={() => setPopupOpen(true)}>Open</ContextMenuItem>
                <ContextMenuItem onClick={() => setRenamePopupOpen(true)}>Rename</ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem>Delete</ContextMenuItem>
            </ContextMenuGroup>
            {children}
        </ContextMenuContent>
    )
}

export { Menu, type NodeLayoutMenuProps }

import { ComponentProps, useCallback } from 'react'
import {
    ContextMenuContent,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuSeparator,
} from '../../../atoms/context-menu'
import { useNodeContext } from './node-layout-context'
import { useReactFlow } from '@xyflow/react'
import { Layers2, Package, Pencil, Trash } from 'lucide-react'
import { useGraphContext } from '../components'

type NodeLayoutMenuProps = {} & ComponentProps<typeof ContextMenuContent>
const Menu = (props: NodeLayoutMenuProps) => {
    const { children, className, ...rest } = props
    const { setRenamePopupOpen, setPopupOpen, nodeId } = useNodeContext()
    const { setNodes, setEdges, getNode, addNodes } = useReactFlow()
    const { viewOnly } = useGraphContext()

    const handleDeleteBtnClick = useCallback(() => {
        setNodes((nds) => nds.filter((n) => n.id !== nodeId))
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId))
    }, [setNodes, setEdges, nodeId])
    const handleDuplicateBtn = useCallback(() => {
        const node = getNode(nodeId)
        if (!node) return
        const position = {
            x: node.position.x,
            y: node.position.y + (node.measured?.height ?? 0) + 20,
        }
        addNodes({
            ...node,
            selected: false,
            dragging: false,
            id: `${node.id}-copy-${Date.now()}`,
            position,
        })
    }, [getNode, addNodes, nodeId])

    if (viewOnly) {
        return null
    }

    return (
        <ContextMenuContent className="w-52" {...rest}>
            <ContextMenuGroup>
                <ContextMenuItem onClick={() => setPopupOpen(true)}>
                    <Package />
                    Open
                </ContextMenuItem>
                <ContextMenuItem onClick={() => setRenamePopupOpen(true)}>
                    <Pencil />
                    Rename
                </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem onClick={handleDuplicateBtn}>
                    <Layers2 />
                    Duplicate
                </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
            <ContextMenuGroup>
                <ContextMenuItem variant="destructive" onClick={handleDeleteBtnClick}>
                    <Trash />
                    Delete
                </ContextMenuItem>
            </ContextMenuGroup>
            {children}
        </ContextMenuContent>
    )
}

export { Menu, type NodeLayoutMenuProps }

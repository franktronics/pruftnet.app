import { ComponentProps, createContext, useContext, useState } from 'react'
import { NodeStatus } from '../nodes/utils'
import { useGraphContext } from '../components'

export type NodeContextType = {
    name: string
    selected: boolean
    nodeId: string
    nodeType: string
    popupOpen: boolean
    setPopupOpen: (open: boolean) => void
    renamePopupOpen: boolean
    setRenamePopupOpen: (open: boolean) => void
    status?: NodeStatus
}
const NodeContext = createContext<NodeContextType>({
    name: '',
    selected: false,
    nodeId: '',
    nodeType: '',
    popupOpen: false,
    setPopupOpen: () => {},
    renamePopupOpen: false,
    setRenamePopupOpen: () => {},
})

export const useNodeContext = () => {
    const context = useContext(NodeContext)
    if (context === undefined) {
        throw new Error('useNodeContext must be used within a NodeProvider')
    }
    return context
}

export type NodeProviderProps = {
    name: string
    selected: boolean
    nodeId: string
    nodeType: string
    status?: NodeStatus
} & ComponentProps<'div'>
export const NodeProvider = (props: NodeProviderProps) => {
    const { children, name, selected, nodeId, nodeType, status, ...rest } = props
    const [popupOpen, setPopupOpen] = useState(false)
    const [renamePopupOpen, setRenamePopupOpen] = useState(false)
    const { viewOnly } = useGraphContext()

    const handlePopupOpen = (open: boolean) => {
        if (viewOnly) return
        setPopupOpen(open)
    }

    const value: NodeContextType = {
        name: name,
        selected: selected,
        nodeId: nodeId,
        nodeType: nodeType,
        popupOpen: popupOpen,
        setPopupOpen: handlePopupOpen,
        renamePopupOpen: renamePopupOpen,
        setRenamePopupOpen: setRenamePopupOpen,
        status: status,
    }

    return (
        <NodeContext.Provider value={value} {...rest}>
            {children}
        </NodeContext.Provider>
    )
}

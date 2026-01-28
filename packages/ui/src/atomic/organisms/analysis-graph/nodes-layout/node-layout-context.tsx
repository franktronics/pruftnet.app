import { ComponentProps, createContext, useContext, useState } from 'react'

export type NodeContextType = {
    name: string
    selected: boolean
    nodeId: string
    nodeType: string
    popupOpen: boolean
    setPopupOpen: (open: boolean) => void
    renamePopupOpen: boolean
    setRenamePopupOpen: (open: boolean) => void
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
} & ComponentProps<'div'>
export const NodeProvider = (props: NodeProviderProps) => {
    const { children, name, selected, nodeId, nodeType, ...rest } = props
    const [popupOpen, setPopupOpen] = useState(false)
    const [renamePopupOpen, setRenamePopupOpen] = useState(false)

    const value: NodeContextType = {
        name: name,
        selected: selected,
        nodeId: nodeId,
        nodeType: nodeType,
        popupOpen: popupOpen,
        setPopupOpen: setPopupOpen,
        renamePopupOpen: renamePopupOpen,
        setRenamePopupOpen: setRenamePopupOpen,
    }

    return (
        <NodeContext.Provider value={value} {...rest}>
            {children}
        </NodeContext.Provider>
    )
}

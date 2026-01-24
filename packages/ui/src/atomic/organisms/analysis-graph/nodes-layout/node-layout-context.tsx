import { ComponentProps, createContext, useContext, useState } from 'react'

export type NodeContextType = {
    name: string
    selected: boolean
    popupOpen: boolean
    setPopupOpen: (open: boolean) => void
    menuOpen: boolean
    setMenuOpen: (open: boolean) => void
}
const NodeContext = createContext<NodeContextType>({
    name: '',
    selected: false,
    popupOpen: false,
    setPopupOpen: () => {},
    menuOpen: false,
    setMenuOpen: () => {},
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
} & ComponentProps<'div'>
export const NodeProvider = (props: NodeProviderProps) => {
    const { children, name, selected, ...rest } = props
    const [popupOpen, setPopupOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)

    const value: NodeContextType = {
        name: name,
        selected: selected,
        popupOpen: popupOpen,
        setPopupOpen: setPopupOpen,
        menuOpen: menuOpen,
        setMenuOpen: setMenuOpen,
    }

    return (
        <NodeContext.Provider value={value} {...rest}>
            {children}
        </NodeContext.Provider>
    )
}

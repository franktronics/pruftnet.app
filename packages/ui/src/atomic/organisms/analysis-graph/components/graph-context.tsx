import { ComponentProps, createContext, useContext } from 'react'

export type GraphContextType = {
    viewOnly: boolean
}
const GraphContext = createContext<GraphContextType>({
    viewOnly: false,
})

export const useGraphContext = () => {
    const context = useContext(GraphContext)
    if (context === undefined) {
        throw new Error('useGraphContext must be used within a GraphProvider')
    }
    return context
}

export type NodeProviderProps = {
    viewOnly?: boolean
} & ComponentProps<'div'>
export const GraphProvider = (props: NodeProviderProps) => {
    const { children, viewOnly = false, ...rest } = props

    const value: GraphContextType = {
        viewOnly: viewOnly,
    }

    return (
        <GraphContext.Provider value={value} {...rest}>
            {children}
        </GraphContext.Provider>
    )
}

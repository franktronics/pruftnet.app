import { createContext, useContext, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import type { PacketDataWithoutRaw } from '@repo/core-node/types'

export type AnalysisContextType = {
    packets: { parsed: any; raw: any; id: number }[]
}

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined)

export const useAnalysisContext = () => {
    const context = useContext(AnalysisContext)
    if (context === undefined) {
        throw new Error('useAnalysisContext must be used within a AnalysisProvider')
    }
    return context
}

export const AnalysisProvider = (props: ComponentPropsWithoutRef<'div'>) => {
    const { children, ...rest } = props
    const [packets, setPackets] = useState<PacketDataWithoutRaw[]>([])

    const value: AnalysisContextType = {
        packets,
    }

    return (
        <AnalysisContext.Provider value={value} {...rest}>
            {children}
        </AnalysisContext.Provider>
    )
}

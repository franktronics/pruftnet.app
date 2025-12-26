import { NetworkGraph } from '@repo/ui/organisms'
import type { ComponentPropsWithoutRef } from 'react'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props

    return (
        <section {...rest}>
            <NetworkGraph className="h-full w-full"></NetworkGraph>
        </section>
    )
}

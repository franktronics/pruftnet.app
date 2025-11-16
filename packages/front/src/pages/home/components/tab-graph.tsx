import { NetworkMap } from '@repo/ui/organisms'
import type { ComponentPropsWithoutRef } from 'react'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props

    return (
        <section {...rest}>
            <NetworkMap className="h-full w-full" />
        </section>
    )
}

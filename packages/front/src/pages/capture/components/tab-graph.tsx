import { NetworkGraph } from '@repo/ui/organisms'
import type { ComponentPropsWithoutRef } from 'react'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props

    return (
        <section {...rest}>
            <NetworkGraph
                forceStrength={-30}
                forceDistance={200}
                alphaDecay={0.01}
                velocityDecay={0.4}
                className="h-full w-full"
            ></NetworkGraph>
        </section>
    )
}

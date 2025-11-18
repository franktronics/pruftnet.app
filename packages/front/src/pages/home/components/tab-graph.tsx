import { NetworkMap, NetworkPcDevice } from '@repo/ui/organisms'
import { Vector } from '@repo/utils'
import type { ComponentPropsWithoutRef } from 'react'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props

    return (
        <section {...rest}>
            <NetworkMap className="h-full w-full">
                <NetworkPcDevice mac="00:1A:2B:3C:4D:5E" position={new Vector(0, 0)} data={{}} />
                <NetworkPcDevice
                    mac="11:22:33:44:55:66"
                    position={new Vector(-200, -150)}
                    data={{}}
                />
                <NetworkPcDevice
                    mac="11:22:33:44:55:66"
                    position={new Vector(-500, -250)}
                    data={{}}
                />
            </NetworkMap>
        </section>
    )
}

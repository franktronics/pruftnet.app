import {
    NetworkConnection,
    NetworkMap,
    NetworkPcDevice,
    NetworkRouterDevice,
} from '@repo/ui/organisms'
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
                    animation="send"
                />
                <NetworkPcDevice
                    mac="81:20:33:44:55:00"
                    position={new Vector(-500, -250)}
                    data={{}}
                />
                <NetworkRouterDevice
                    mac="77:88:99:AA:BB:CC"
                    position={new Vector(100, -400)}
                    data={{}}
                />
                <NetworkConnection
                    fromMac="00:1A:2B:3C:4D:5E"
                    toMac="11:22:33:44:55:66"
                    color="var(--foreground)"
                />
                <NetworkConnection
                    fromMac="11:22:33:44:55:66"
                    toMac="81:20:33:44:55:00"
                    color="var(--foreground)"
                    bidirectional={true}
                />
                <NetworkConnection
                    fromMac="11:22:33:44:55:66"
                    toMac="77:88:99:AA:BB:CC"
                    color="var(--foreground)"
                />
            </NetworkMap>
        </section>
    )
}

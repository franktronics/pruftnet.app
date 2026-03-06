import { NetworkGraph } from '@repo/ui/organisms'
import { useMemo, type ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import type { Edge, Node } from '@repo/utils'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props
    const { analyzer } = useScanControlContext()
    const { devices, connections, vendorOui } = analyzer

    const [nodes, edges] = useMemo(() => {
        const nodes: Node[] = devices.map((device) => ({
            id: device.id,
            type: device.type,
            position: { x: 0, y: 0 },
            data: {
                mac: device.data.mac,
                vendor: vendorOui[device.data.mac]?.vendor || undefined,
                ipv4: device.data.ipv4,
                ipv6: device.data.ipv6,
            },
        }))
        const edges: Edge[] = connections.map((connection) => ({
            id: connection.id,
            type: 'exchange',
            source: connection.source,
            target: connection.target,
            animated: true,
            markerEnd: { type: 'arrowclosed' },
            data: {
                numPackets: connection.data.numPackets,
            },
        }))
        return [nodes, edges]
    }, [devices, connections, vendorOui])

    return (
        <section {...rest}>
            <NetworkGraph
                forceStrength={-30}
                forceDistance={200}
                alphaDecay={0.01}
                velocityDecay={0.4}
                className="h-full w-full"
                injectedNodes={nodes}
                injectedEdges={edges}
            ></NetworkGraph>
        </section>
    )
}

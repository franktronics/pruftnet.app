import { NetworkGraph } from '@repo/ui/organisms'
import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import type { Edge, Node } from '@repo/utils'
import { HostFilter } from './host-filter'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props
    const { hostData } = useScanControlContext() //hostData: Map<string, HostBaseData>
    const [filteredHost, setFilteredHost] = useState(hostData)

    const [nodes, edges] = useMemo(() => {
        const nodes: Node[] = Array.from(filteredHost.values()).map((host) => ({
            id: host.mac,
            type: 'device',
            position: { x: 0, y: 0 },
            data: host,
        }))
        const edges: Edge[] = []
        filteredHost.forEach((host) => {
            Object.entries(host.connectedTo).forEach(([targetMac, linkData]) => {
                const edgeId = `${host.mac}-${targetMac}`
                edges.push({
                    id: edgeId,
                    type: 'exchange',
                    source: host.mac,
                    target: targetMac,
                    animated: false,
                    markerEnd: { type: 'arrowclosed' },
                    data: linkData,
                })
            })
        })
        return [nodes, edges]
    }, [hostData])

    return (
        <section {...rest}>
            <NetworkGraph
                forceStrength={-30}
                forceDistance={250}
                alphaDecay={0.05}
                velocityDecay={0.8}
                className="h-full w-full"
                injectedNodes={nodes}
                injectedEdges={edges}
            >
                <HostFilter
                    hostData={hostData}
                    filteredHost={filteredHost}
                    onSetFilteredHost={setFilteredHost}
                />
            </NetworkGraph>
        </section>
    )
}

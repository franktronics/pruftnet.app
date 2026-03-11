import { NetworkGraph } from '@repo/ui/organisms'
import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import type { Edge, Node } from '@repo/utils'
import { HostFilter } from './host-filter'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props
    const { hostData } = useScanControlContext() //hostData: Map<string, HostBaseData>
    const [excludedHostMacs, setExcludedHostMacs] = useState<string[]>([])

    useEffect(() => {
        setExcludedHostMacs((currentExcludedMacs) =>
            currentExcludedMacs.filter((mac) => hostData.has(mac)),
        )
    }, [hostData])

    const filteredHost = useMemo(() => {
        const excludedMacs = new Set(excludedHostMacs)

        return new Map(Array.from(hostData.entries()).filter(([mac]) => !excludedMacs.has(mac)))
    }, [hostData, excludedHostMacs])

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
                if (!filteredHost.has(targetMac)) {
                    return
                }

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
    }, [filteredHost])

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
                    excludedHostMacs={excludedHostMacs}
                    onChangeExcludedHostMacs={setExcludedHostMacs}
                />
            </NetworkGraph>
        </section>
    )
}

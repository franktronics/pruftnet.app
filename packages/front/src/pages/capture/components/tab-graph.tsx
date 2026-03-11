import { NetworkGraph } from '@repo/ui/organisms'
import { useMemo, type ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import type { Edge, Node } from '@repo/utils'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>
export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props
    const { hostData } = useScanControlContext() //hostData: Map<string, HostBaseData>

    const [nodes, edges] = useMemo(() => {
        const nodes: Node[] = Array.from(hostData.values()).map((host) => ({
            id: host.mac,
            type: 'device',
            position: { x: 0, y: 0 },
            data: host,
        }))
        const edges: Edge[] = []
        hostData.forEach((host) => {
            Object.entries(host.connectedTo).forEach(([targetMac, linkData]) => {
                const edgeId = `${host.mac}-${targetMac}`
                edges.push({
                    id: edgeId,
                    type: 'exchange',
                    source: host.mac,
                    target: targetMac,
                    animated: true,
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

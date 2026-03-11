import { NetworkGraph } from '@repo/ui/organisms'
import { useEffect, useMemo, useState, type ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'
import type { Edge, Node } from '@repo/utils'
import { HostFilter } from './host-filter'

export type TabGraphProps = {} & ComponentPropsWithoutRef<'section'>

const isMulticastMac = (mac: string) => {
    const firstOctet = Number.parseInt(mac.split(':')[0] || '', 16)

    if (Number.isNaN(firstOctet)) {
        return false
    }

    return (firstOctet & 1) === 1
}

const isBroadcastMac = (mac: string) => mac.toUpperCase() === 'FF:FF:FF:FF:FF:FF'

const hasIpAddress = (host: { ipv4?: string; ipv6?: string }) => !!host.ipv4 || !!host.ipv6

export const TabGraph = (props: TabGraphProps) => {
    const { ...rest } = props
    const { hostData } = useScanControlContext() //hostData: Map<string, HostBaseData>
    const [excludedHostMacs, setExcludedHostMacs] = useState<string[]>([])
    const [hideMulticastHosts, setHideMulticastHosts] = useState(true)
    const [hideBroadcastHosts, setHideBroadcastHosts] = useState(true)
    const [hideHostsWithoutIp, setHideHostsWithoutIp] = useState(false)

    useEffect(() => {
        setExcludedHostMacs((currentExcludedMacs) =>
            currentExcludedMacs.filter((mac) => hostData.has(mac)),
        )
    }, [hostData])

    const filteredHost = useMemo(() => {
        const excludedMacs = new Set(excludedHostMacs)

        return new Map(
            Array.from(hostData.entries()).filter(([mac, host]) => {
                if (excludedMacs.has(mac)) {
                    return false
                }

                if (hideBroadcastHosts && isBroadcastMac(mac)) {
                    return false
                }

                if (hideMulticastHosts && isMulticastMac(mac)) {
                    return false
                }

                if (hideHostsWithoutIp && !hasIpAddress(host)) {
                    return false
                }

                return true
            }),
        )
    }, [hostData, excludedHostMacs, hideBroadcastHosts, hideHostsWithoutIp, hideMulticastHosts])

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
                    hideBroadcastHosts={hideBroadcastHosts}
                    hideMulticastHosts={hideMulticastHosts}
                    hideHostsWithoutIp={hideHostsWithoutIp}
                    onChangeExcludedHostMacs={setExcludedHostMacs}
                    onChangeHideBroadcastHosts={setHideBroadcastHosts}
                    onChangeHideMulticastHosts={setHideMulticastHosts}
                    onChangeHideHostsWithoutIp={setHideHostsWithoutIp}
                />
            </NetworkGraph>
        </section>
    )
}

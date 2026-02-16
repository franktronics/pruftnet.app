import type { PacketDataWithoutRaw, VendorOuiData } from '@repo/core-node/types'
import { useQueries } from '@repo/utils'
import { useRef, useState } from 'react'
import { fetcher } from '../../../../config/client-trpc'
import { PacketParser, type ConnectionType, type DeviceBasisType } from './packet-parser'

export const useNetworkAnalyzer = () => {
    const [devicesStore, setDevicesStore] = useState<Map<string, DeviceBasisType>>(new Map())
    const [connectionsStore, setConnectionsStore] = useState<Map<string, ConnectionType>>(new Map())

    const packetParser = useRef<PacketParser>(new PacketParser())
    const vendorOui = useQueries({
        queries: Array.from(devicesStore).map((elt) => {
            const mac = elt[1].data.mac
            return {
                queryKey: ['vendor_oui', mac],
                staleTime: Infinity,
                enabled: !!mac,
                retry: 0,
                queryFn: fetcher.vendor.getOui.query({ mac }),
            }
        }),
        combine: (
            results,
        ): Record<string, VendorOuiData & { pending: boolean; error: Error | null }> => {
            return Object.fromEntries(
                results.map(
                    (res) =>
                        [
                            res.data?.mac,
                            { ...res.data, pending: res.isPending, error: res.error },
                        ] as const,
                ),
            )
        },
    })

    const handleRegisterPacket = (packet: PacketDataWithoutRaw) => {
        const { devices, connections } = packetParser.current.parse(
            packet,
            devicesStore,
            connectionsStore,
        )
        if (devices.size > 0) {
            setDevicesStore((prev) => new Map([...prev, ...devices]))
        }
        if (connections.size > 0) {
            setConnectionsStore((prev) => new Map([...prev, ...connections]))
        }
    }
    return {
        registerPacket: handleRegisterPacket,
        devices: Array.from(devicesStore.values()),
        connections: Array.from(connectionsStore.values()),
        vendorOui,
    }
}

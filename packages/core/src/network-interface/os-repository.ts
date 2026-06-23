import { networkInterfaces } from 'node:os'
import type { NetworkInterfaceInfo as NodeNetworkInterfaceInfo } from 'node:os'

import type { NetworkInterfaceInfo, NetworkInterfaces } from '@repo/shared/network-interface'
import { InterfacesNotFound } from '@repo/shared/network-interface'
import { Effect, Layer } from 'effect'

import { NetworkInterfaceRepository } from './repository'

function toNetworkInterfaceInfo(info: NodeNetworkInterfaceInfo): NetworkInterfaceInfo | undefined {
    const base = {
        address: info.address,
        netmask: info.netmask,
        mac: info.mac,
        internal: info.internal,
        cidr: info.cidr ?? null,
    }

    if (info.family === 'IPv4') {
        return {
            ...base,
            family: 'IPv4',
        }
    }

    if (info.family === 'IPv6') {
        return {
            ...base,
            family: 'IPv6',
            scopeid: info.scopeid ?? 0,
        }
    }

    return undefined
}

function readNetworkInterfaces(): NetworkInterfaces {
    const interfaces = networkInterfaces()
    const entries: Array<readonly [string, ReadonlyArray<NetworkInterfaceInfo>]> = []

    for (const [name, infos] of Object.entries(interfaces)) {
        const normalized = infos?.flatMap((info) => {
            const normalizedInfo = toNetworkInterfaceInfo(info)
            return normalizedInfo ? [normalizedInfo] : []
        })

        if (normalized && normalized.length > 0) {
            entries.push([name, normalized])
        }
    }

    return Object.fromEntries(entries)
}

export const NetworkInterfaceRepositoryLive = Layer.succeed(NetworkInterfaceRepository, {
    getAll: () => {
        return Effect.sync(readNetworkInterfaces).pipe(
            Effect.filterOrFail(
                (interfaces) => Object.keys(interfaces).length > 0,
                () =>
                    new InterfacesNotFound({
                        title: 'No network interfaces found',
                        message:
                            'The operating system did not return any usable network interface.',
                        whatToDo: 'Check network settings or permissions, then retry.',
                        retryable: true,
                        severity: 'error',
                    }),
            ),
        )
    },
})

import { queryOptions } from '@tanstack/react-query'

import { captureClient } from './capture-client'

export const captureKeys = {
    all: ['capture'] as const,
    interfaces: () => [...captureKeys.all, 'interfaces'] as const,
    capabilities: (name: string, monitorMode: boolean) =>
        [...captureKeys.all, 'capabilities', name, monitorMode] as const,
    session: (captureId: string) => [...captureKeys.all, captureId, 'session'] as const,
    stats: (captureId: string) => [...captureKeys.all, captureId, 'stats'] as const,
    events: (captureId: string) => [...captureKeys.all, captureId, 'events'] as const,
    summaries: (captureId: string) => [...captureKeys.all, captureId, 'summaries'] as const,
    registry: (revision: string) => [...captureKeys.all, 'registry', revision] as const,
    detail: (
        captureId: string,
        packetId: string,
        analysisRevision: string,
        registryRevision: string,
    ) =>
        [
            ...captureKeys.all,
            captureId,
            'detail',
            packetId,
            analysisRevision,
            registryRevision,
        ] as const,
}

export const captureInterfacesOptions = () =>
    queryOptions({
        queryKey: captureKeys.interfaces(),
        queryFn: captureClient.interfaces,
        staleTime: 5_000,
    })

export const captureCapabilitiesOptions = (name: string, monitorMode: boolean) =>
    queryOptions({
        queryKey: captureKeys.capabilities(name, monitorMode),
        queryFn: () => captureClient.capabilities(name, monitorMode),
        staleTime: 30_000,
    })

export const captureSessionOptions = (captureId: string) =>
    queryOptions({
        queryKey: captureKeys.session(captureId),
        queryFn: () => captureClient.session(captureId),
        refetchInterval: (query) =>
            query.state.data?.state === 'running' || query.state.data?.state === 'starting'
                ? 1_000
                : false,
    })

export const captureStatsOptions = (captureId: string, terminal: boolean) =>
    queryOptions({
        queryKey: captureKeys.stats(captureId),
        queryFn: () => captureClient.stats(captureId),
        refetchInterval: terminal ? false : 1_000,
    })

export const registryOptions = (revision: string) =>
    queryOptions({
        queryKey: captureKeys.registry(revision),
        queryFn: () => captureClient.registry(revision),
        staleTime: Infinity,
    })

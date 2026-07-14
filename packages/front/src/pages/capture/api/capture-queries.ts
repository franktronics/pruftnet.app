import { queryOptions } from '@tanstack/react-query'

import { captureClient } from './capture-client'

export const captureKeys = {
    all: ['capture'] as const,
    interfaces: () => [...captureKeys.all, 'interfaces'] as const,
    capabilities: (name: string, monitorMode: boolean) =>
        [...captureKeys.all, 'capabilities', name, monitorMode] as const,
    session: (captureId: string) => [...captureKeys.all, captureId, 'session'] as const,
    stats: (captureId: string) => [...captureKeys.all, captureId, 'stats'] as const,
    statSamples: (captureId: string) => [...captureKeys.all, captureId, 'stat-samples'] as const,
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
    history: () => [...captureKeys.all, 'history'] as const,
    active: () => [...captureKeys.all, 'active'] as const,
    exports: (captureId?: string) => [...captureKeys.all, 'exports', captureId ?? 'all'] as const,
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

export const captureStatSamplesOptions = (captureId: string, terminal: boolean) =>
    queryOptions({
        queryKey: captureKeys.statSamples(captureId),
        queryFn: () => captureClient.statSamples(captureId),
        refetchInterval: terminal ? false : 5_000,
    })

export const registryOptions = (revision: string) =>
    queryOptions({
        queryKey: captureKeys.registry(revision),
        queryFn: () => captureClient.registry(revision),
        staleTime: Infinity,
    })

export const captureHistoryOptions = () =>
    queryOptions({
        queryKey: captureKeys.history(),
        queryFn: captureClient.captures,
        refetchInterval: 2_000,
    })

export const activeCaptureOptions = () =>
    queryOptions({
        queryKey: captureKeys.active(),
        queryFn: captureClient.activeCapture,
        refetchInterval: 2_000,
    })

export const exportListOptions = (captureId?: string) =>
    queryOptions({
        queryKey: captureKeys.exports(captureId),
        queryFn: () => captureClient.exports(captureId),
        refetchInterval: (query) =>
            query.state.data?.exports.some((job) =>
                ['queued', 'preparing', 'running', 'finalizing'].includes(job.state),
            )
                ? 1_000
                : false,
    })

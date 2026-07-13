import type { RegistrySnapshot } from '@repo/shared/capture'
import { useQuery } from '@tanstack/react-query'

import { getRpcEndpoint } from '#front/config/rpc-client'
import { captureKeys } from '#front/pages/capture/api/capture-queries'
import { retryTransientFailure } from '#front/config/query-client'
import type {
    PacketDetailModel,
    PacketDetailWorkerResponse,
} from '#front/pages/capture/model/packet-detail'

export class PacketDetailHttpError extends Error {
    readonly status: number
    constructor(status: number) {
        super(`Packet detail request failed (${status})`)
        this.status = status
    }
}

export class PacketDetailContentTypeError extends Error {
    readonly contentType: string | null
    constructor(contentType: string | null) {
        super(`Unexpected packet detail content type: ${contentType ?? 'missing'}`)
        this.contentType = contentType
    }
}

export class PacketDetailKeyError extends Error {
    constructor() {
        super('Packet detail payload key does not match the selected packet')
    }
}

export class PacketDetailInvalidError extends Error {
    constructor(options: ErrorOptions) {
        super('Packet detail payload is invalid', options)
    }
}

export type PacketDetailState =
    | { readonly kind: 'empty' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'ready'; readonly detail: PacketDetailModel }
    | { readonly kind: 'pending' }
    | { readonly kind: 'evicted' }
    | { readonly kind: 'unavailable' }
    | { readonly kind: 'invalid' }

export function packetDetailState(
    packetId: string | undefined,
    pending: boolean,
    detail: PacketDetailModel | undefined,
    error: unknown,
): PacketDetailState {
    if (!packetId) return { kind: 'empty' }
    if (detail) return { kind: 'ready', detail }
    if (pending) return { kind: 'loading' }
    if (error instanceof PacketDetailHttpError && error.status === 425) return { kind: 'pending' }
    if (error instanceof PacketDetailHttpError && error.status === 410) return { kind: 'evicted' }
    if (error instanceof PacketDetailHttpError && error.status === 422) return { kind: 'invalid' }
    if (
        error instanceof PacketDetailContentTypeError ||
        error instanceof PacketDetailKeyError ||
        error instanceof PacketDetailInvalidError
    )
        return { kind: 'invalid' }
    return { kind: 'unavailable' }
}

export function packetDetailUrl(
    captureId: string,
    packetId: string,
    registryRevision?: string,
    analysisRevision?: string,
    endpoint = getRpcEndpoint(),
) {
    const url = new URL(endpoint)
    url.pathname = `/capture/${encodeURIComponent(captureId)}/packets/${encodeURIComponent(packetId)}`
    if (registryRevision) url.searchParams.set('registryRevision', registryRevision)
    if (analysisRevision) url.searchParams.set('analysisRevision', analysisRevision)
    return url.toString()
}

function decodeInWorker(
    bytes: ArrayBuffer,
    registry: RegistrySnapshot,
    captureId: string,
    packetId: string,
    signal: AbortSignal,
): Promise<PacketDetailModel> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(
            new URL('#front/pages/capture/model/packet-detail.worker.ts', import.meta.url),
            {
                type: 'module',
            },
        )
        let settled = false
        const finish = (callback: () => void) => {
            if (settled) return
            settled = true
            signal.removeEventListener('abort', abort)
            worker.terminate()
            callback()
        }
        const abort = () =>
            finish(() => reject(new DOMException('Packet detail request aborted', 'AbortError')))
        worker.onmessage = ({ data }: MessageEvent<PacketDetailWorkerResponse>) =>
            finish(() => {
                if (data.kind === 'success') resolve(data.model)
                else if (data.error.kind === 'key') reject(new PacketDetailKeyError())
                else reject(new PacketDetailInvalidError({ cause: new Error(data.error.message) }))
            })
        worker.onerror = (event) =>
            finish(() => reject(new PacketDetailInvalidError({ cause: new Error(event.message) })))
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
        else
            worker.postMessage(
                { bytes, registry, expectedCaptureId: captureId, expectedPacketId: packetId },
                [bytes],
            )
    })
}

export function usePacketDetail(
    captureId: string,
    packetId: string | undefined,
    analysisRevision: string | undefined,
    registry: RegistrySnapshot | undefined,
) {
    return useQuery({
        queryKey: captureKeys.detail(
            captureId,
            packetId ?? '',
            analysisRevision ?? '',
            registry?.registryRevision ?? '',
        ),
        enabled: Boolean(packetId && analysisRevision && registry),
        queryFn: async ({ signal }) => {
            if (!packetId || !registry)
                throw new Error('Packet detail requires a packet and registry')
            const response = await fetch(
                packetDetailUrl(captureId, packetId, registry.registryRevision, analysisRevision),
                { signal },
            )
            if (!response.ok) throw new PacketDetailHttpError(response.status)
            const contentType = response.headers.get('content-type')
            if (
                contentType?.split(';', 1)[0]?.trim().toLowerCase() !==
                'application/vnd.pruftnet.packet-tree'
            )
                throw new PacketDetailContentTypeError(contentType)
            const bytes = await response.arrayBuffer()
            if (signal.aborted)
                throw new DOMException('Packet detail request aborted', 'AbortError')
            return decodeInWorker(bytes, registry, captureId, packetId, signal)
        },
        staleTime: Infinity,
        gcTime: 30_000,
        retry: retryTransientFailure,
    })
}

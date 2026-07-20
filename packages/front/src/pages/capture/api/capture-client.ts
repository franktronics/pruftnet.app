import {
    DesktopExportDestination,
    ServerExportDestination,
    type ExportFormat,
    type LiveCaptureSource,
    type PacketSummaryFilter,
    ReplayCaptureSource,
} from '@repo/shared/capture'

import { callRpc } from '#front/config/effect-runtime'

export const captureClient = {
    interfaces: () => callRpc((client) => client.ListCaptureInterfaces()),
    capabilities: (name: string, monitorMode: boolean) =>
        callRpc((client) => client.GetCaptureInterfaceCapabilities({ name, monitorMode })),
    session: (captureId: string) => callRpc((client) => client.GetCaptureSession({ captureId })),
    startReplay: (fileId: string) =>
        callRpc((client) => client.StartCapture({ source: new ReplayCaptureSource({ fileId }) })),
    startLive: (source: LiveCaptureSource) => callRpc((client) => client.StartCapture({ source })),
    stop: (captureId: string) => callRpc((client) => client.StopCapture({ captureId })),
    stats: (captureId: string) => callRpc((client) => client.GetCaptureStats({ captureId })),
    statSamples: (captureId: string) =>
        callRpc((client) => client.ListCaptureStatSamples({ captureId, limit: 1_000 })),
    summaries: (captureId: string, afterCursor?: string) =>
        callRpc((client) => client.ReadPacketSummaries({ captureId, afterCursor, limit: 1024 })),
    summaryManifest: (
        captureId: string,
        filter: PacketSummaryFilter | null,
        signal?: AbortSignal,
    ) => callRpc((client) => client.GetPacketSummaryManifest({ captureId, filter }), { signal }),
    summaryRange: (
        captureId: string,
        revision: string,
        filter: PacketSummaryFilter | null,
        startIndex: number,
        limit: number,
        signal?: AbortSignal,
    ) =>
        callRpc(
            (client) =>
                client.ReadPacketSummaryRange({
                    captureId,
                    revision,
                    filter,
                    startIndex,
                    limit,
                }),
            { signal },
        ),
    events: (captureId: string, afterCursor?: string) =>
        callRpc((client) => client.ReadCaptureEvents({ captureId, afterCursor, limit: 512 })),
    registry: (registryRevision: string) =>
        callRpc((client) => client.GetRegistrySnapshot({ registryRevision })),
    captures: () => callRpc((client) => client.ListCaptures()),
    capture: (captureId: string) => callRpc((client) => client.GetCapture({ captureId })),
    activeCapture: () => callRpc((client) => client.GetActiveCapture()),
    openCapture: (captureId: string) => callRpc((client) => client.OpenCapture({ captureId })),
    deleteCapture: (captureId: string) => callRpc((client) => client.DeleteCapture({ captureId })),
    createExport: (input: {
        captureId: string
        format: ExportFormat
        destinationLabel: string
        destinationToken?: string
    }) =>
        callRpc((client) =>
            client.CreateExport({
                captureId: input.captureId,
                format: input.format,
                destinationLabel: input.destinationLabel,
                destination: input.destinationToken
                    ? new DesktopExportDestination({
                          destinationToken: input.destinationToken,
                      })
                    : new ServerExportDestination(),
            }),
        ),
    exportJobs: () => callRpc((client) => client.ListExportJobs()),
}

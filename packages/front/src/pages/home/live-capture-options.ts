import { LiveCaptureInterface, LiveCaptureSource } from '@repo/shared/capture'

export type LiveInterfaceSettings = {
    promiscuous: boolean
    monitorMode: boolean
    linkType: number | null
    timestampType: string | null
}

export type LiveBufferSettings = {
    bpfFilter: string
    snaplen: number
    bufferMiB: number
    ringSlots: number
}

export function buildLiveCaptureSource(
    selected: Readonly<Record<string, LiveInterfaceSettings>>,
    settings: LiveBufferSettings,
) {
    const interfaces = Object.entries(selected).map(
        ([name, value]) =>
            new LiveCaptureInterface({
                name,
                promiscuous: value.promiscuous,
                monitorMode: value.monitorMode,
                linkType: value.linkType,
                timestampType: value.timestampType,
            }),
    )
    if (interfaces.length === 0) throw new Error('At least one capture interface is required')
    return new LiveCaptureSource({
        interfaces: interfaces as [LiveCaptureInterface, ...LiveCaptureInterface[]],
        bpfFilter: settings.bpfFilter.trim(),
        snaplen: settings.snaplen,
        pcapBufferSizeBytes: settings.bufferMiB * 1024 * 1024,
        readTimeoutMs: 10,
        dispatchBatchSize: 64,
        ringSlots: settings.ringSlots,
        maxTotalRingBytes: 512 * 1024 * 1024,
    })
}

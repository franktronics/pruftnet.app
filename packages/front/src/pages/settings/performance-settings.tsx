import { useEffect, useSyncExternalStore } from 'react'

import { NativeSelect, NativeSelectOption, Progress, ProgressLabel } from '@repo/ui'

import {
    automaticPacketListCacheMiB,
    currentCacheBudgetEnvironment,
    PACKET_LIST_CACHE_PRESETS_MIB,
    type PacketListCacheMode,
} from '#front/app/settings/app-settings'
import { useAppSettings } from '#front/app/settings/app-settings-context'
import { formatBytes } from '#front/pages/captures/format-bytes'
import { packetSummaryPageCache } from '#front/pages/capture/model/packet-summary-cache'
import { SettingRow, SettingsGroup } from './settings-layout'

function CacheUsage() {
    const cache = useSyncExternalStore(
        packetSummaryPageCache.subscribe,
        packetSummaryPageCache.getSnapshot,
        packetSummaryPageCache.getSnapshot,
    )

    useEffect(() => packetSummaryPageCache.reconcile(), [])

    const usage = cache.budgetBytes === 0 ? 0 : (cache.retainedBytes / cache.budgetBytes) * 100

    return (
        <div className="grid gap-2 py-3">
            <Progress value={Math.min(100, usage)}>
                <ProgressLabel className="text-[13px]">In use</ProgressLabel>
                <span className="ml-auto font-mono text-xs tabular-nums">
                    {formatBytes(BigInt(cache.retainedBytes))} /{' '}
                    {formatBytes(BigInt(cache.budgetBytes))}
                </span>
            </Progress>
            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                <span>{cache.retainedPages.toLocaleString()} pages</span>
                <span>{cache.retainedDatasets.toLocaleString()} datasets</span>
                <span>{cache.evictions.toLocaleString()} evictions this session</span>
            </div>
        </div>
    )
}

export function PerformanceSettings() {
    const { settings, setPacketListCacheMode, setPacketListCacheMaximumMiB } = useAppSettings()
    const automaticCacheMiB = automaticPacketListCacheMiB(currentCacheBudgetEnvironment())

    return (
        <SettingsGroup title="Packet list memory">
            <SettingRow
                label="Memory policy"
                htmlFor="packet-cache-mode"
                description="Automatic adapts to the renderer heap and available device memory."
                control={
                    <NativeSelect
                        id="packet-cache-mode"
                        className="w-44"
                        value={settings.packetListCache.mode}
                        onChange={(event) =>
                            setPacketListCacheMode(event.target.value as PacketListCacheMode)
                        }
                    >
                        <NativeSelectOption value="automatic">
                            Automatic ({automaticCacheMiB} MiB)
                        </NativeSelectOption>
                        <NativeSelectOption value="manual">Manual</NativeSelectOption>
                    </NativeSelect>
                }
            />
            <SettingRow
                label="Maximum memory"
                htmlFor="packet-cache-maximum"
                description="Applies only to decoded packet-list summaries, never raw capture files."
                control={
                    <NativeSelect
                        id="packet-cache-maximum"
                        className="w-44"
                        value={settings.packetListCache.maximumMiB}
                        disabled={settings.packetListCache.mode !== 'manual'}
                        onChange={(event) =>
                            setPacketListCacheMaximumMiB(Number(event.target.value))
                        }
                    >
                        {PACKET_LIST_CACHE_PRESETS_MIB.map((value) => (
                            <NativeSelectOption key={value} value={value}>
                                {value.toLocaleString()} MiB
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                }
            />
            <CacheUsage />
        </SettingsGroup>
    )
}

import { Database, Gauge, Palette, RotateCcw } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'

import {
    Button,
    Label,
    NativeSelect,
    NativeSelectOption,
    Progress,
    ProgressLabel,
} from '@repo/ui/atoms'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@repo/ui/molecules'

import { formatBytes } from '#front/pages/captures/format-bytes'
import { packetSummaryPageCache } from '#front/pages/capture/model/packet-summary-cache'
import {
    automaticPacketListCacheMiB,
    currentCacheBudgetEnvironment,
    PACKET_LIST_CACHE_PRESETS_MIB,
    type PacketListCacheMode,
} from '#front/settings/app-settings'
import { useAppSettings } from '#front/settings/app-settings-context'
import { themes, type Theme } from '#front/theme/theme'
import { useTheme } from '#front/theme/theme-provider'

const themeLabels: Record<Theme, string> = {
    system: 'System',
    light: 'Light',
    dark: 'Dark',
}

function CacheUsage() {
    const cache = useSyncExternalStore(
        packetSummaryPageCache.subscribe,
        packetSummaryPageCache.getSnapshot,
        packetSummaryPageCache.getSnapshot,
    )

    useEffect(() => packetSummaryPageCache.reconcile(), [])

    const usage = cache.budgetBytes === 0 ? 0 : (cache.retainedBytes / cache.budgetBytes) * 100

    return (
        <div className="bg-muted/35 rounded-md border p-3">
            <Progress value={Math.min(100, usage)}>
                <ProgressLabel>Current packet-list cache</ProgressLabel>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {formatBytes(BigInt(cache.retainedBytes))} /{' '}
                    {formatBytes(BigInt(cache.budgetBytes))}
                </span>
            </Progress>
            <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] tabular-nums">
                <span>{cache.retainedPages.toLocaleString()} retained pages</span>
                <span>{cache.retainedDatasets.toLocaleString()} datasets</span>
                <span>{cache.evictions.toLocaleString()} evictions this session</span>
            </div>
        </div>
    )
}

export function SettingsPage() {
    const { theme, setTheme } = useTheme()
    const { settings, setPacketListCacheMode, setPacketListCacheMaximumMiB, resetSettings } =
        useAppSettings()
    const automaticCacheMiB = automaticPacketListCacheMiB(currentCacheBudgetEnvironment())

    return (
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-10">
            <header className="flex flex-wrap items-end justify-between gap-3 border-b py-5">
                <div>
                    <p className="text-muted-foreground font-mono text-[0.6875rem] tracking-widest uppercase">
                        Application control
                    </p>
                    <h1 className="mt-1 text-xl font-semibold tracking-tight">Settings</h1>
                    <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                        Tune the inspection workspace without changing retained capture data.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => {
                        resetSettings()
                        setTheme('system')
                    }}
                >
                    <RotateCcw />
                    Reset application settings
                </Button>
            </header>

            <div className="grid items-start gap-5 md:grid-cols-[11rem_minmax(0,1fr)]">
                <nav
                    aria-label="Settings sections"
                    className="bg-muted/25 grid gap-1 rounded-lg border p-2 md:sticky md:top-4"
                >
                    <a
                        href="#appearance"
                        className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2"
                    >
                        <Palette className="size-3.5" />
                        Appearance
                    </a>
                    <a
                        href="#performance"
                        className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2"
                    >
                        <Gauge className="size-3.5" />
                        Performance
                    </a>
                    <a
                        href="#storage"
                        className="hover:bg-muted focus-visible:ring-ring flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium outline-none focus-visible:ring-2"
                    >
                        <Database className="size-3.5" />
                        Storage
                    </a>
                </nav>

                <div className="grid min-w-0 gap-5">
                    <Card id="appearance">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="text-muted-foreground size-4" />
                                Appearance
                            </CardTitle>
                            <CardDescription>
                                Choose how the application follows the operating system.
                            </CardDescription>
                            <CardAction>
                                <NativeSelect
                                    aria-label="Application theme"
                                    value={theme}
                                    onChange={(event) => setTheme(event.target.value as Theme)}
                                >
                                    {themes.map((value) => (
                                        <NativeSelectOption key={value} value={value}>
                                            {themeLabels[value]}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </CardAction>
                        </CardHeader>
                    </Card>

                    <Card id="performance">
                        <CardHeader className="border-b">
                            <CardTitle className="flex items-center gap-2">
                                <Gauge className="text-muted-foreground size-4" />
                                Packet-list performance
                            </CardTitle>
                            <CardDescription>
                                Retain decoded summary pages so revisiting packets does not trigger
                                another read.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <div>
                                    <Label htmlFor="packet-cache-mode">Memory policy</Label>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        Automatic adapts to the renderer heap and available device
                                        memory.
                                    </p>
                                </div>
                                <NativeSelect
                                    id="packet-cache-mode"
                                    className="w-full"
                                    value={settings.packetListCache.mode}
                                    onChange={(event) =>
                                        setPacketListCacheMode(
                                            event.target.value as PacketListCacheMode,
                                        )
                                    }
                                >
                                    <NativeSelectOption value="automatic">
                                        Automatic ({automaticCacheMiB} MiB)
                                    </NativeSelectOption>
                                    <NativeSelectOption value="manual">Manual</NativeSelectOption>
                                </NativeSelect>
                            </div>

                            <div className="grid gap-2 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                <div>
                                    <Label htmlFor="packet-cache-maximum">Maximum memory</Label>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                        Applies only to decoded packet-list summaries, never raw
                                        capture files.
                                    </p>
                                </div>
                                <NativeSelect
                                    id="packet-cache-maximum"
                                    className="w-full"
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
                            </div>

                            <CacheUsage />
                        </CardContent>
                    </Card>

                    <Card id="storage">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="text-muted-foreground size-4" />
                                Capture storage
                            </CardTitle>
                            <CardDescription>
                                Capture files, durable summaries, and exports remain backend-owned.
                                Storage controls will be added here when retention policies become
                                user-configurable.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                </div>
            </div>
        </section>
    )
}

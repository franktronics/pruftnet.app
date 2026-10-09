export const APP_SETTINGS_STORAGE_KEY = 'pruftnet-app-settings-v1'
export const PACKET_LIST_CACHE_PRESETS_MIB = [64, 128, 256, 512, 1_024] as const

export type PacketListCacheMode = 'automatic' | 'manual'

export interface AppSettings {
    readonly packetListCache: {
        readonly mode: PacketListCacheMode
        readonly maximumMiB: number
    }
}

export interface CacheBudgetEnvironment {
    readonly desktop: boolean
    readonly deviceMemoryGiB?: number
    readonly jsHeapLimitMiB?: number
}

export const defaultAppSettings: AppSettings = {
    packetListCache: {
        mode: 'automatic',
        maximumMiB: 256,
    },
}

function boundedManualCacheMiB(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return defaultAppSettings.packetListCache.maximumMiB
    }
    return Math.max(64, Math.min(1_024, Math.round(value)))
}

export function parseAppSettings(value: string | null): AppSettings {
    if (!value) return defaultAppSettings

    try {
        const candidate = JSON.parse(value) as {
            packetListCache?: {
                mode?: unknown
                maximumMiB?: unknown
            }
        }
        const mode =
            candidate.packetListCache?.mode === 'manual'
                ? ('manual' as const)
                : ('automatic' as const)
        return {
            packetListCache: {
                mode,
                maximumMiB: boundedManualCacheMiB(candidate.packetListCache?.maximumMiB),
            },
        }
    } catch {
        return defaultAppSettings
    }
}

export function automaticPacketListCacheMiB(environment: CacheBudgetEnvironment): number {
    const minimum = environment.desktop ? 128 : 64
    const maximum = environment.desktop ? 512 : 256
    const fallback = environment.desktop ? 256 : 128
    const candidates: number[] = []

    if (environment.jsHeapLimitMiB && environment.jsHeapLimitMiB > 0) {
        candidates.push(
            Math.floor(environment.jsHeapLimitMiB * (environment.desktop ? 0.08 : 0.05)),
        )
    }
    if (environment.deviceMemoryGiB && environment.deviceMemoryGiB > 0) {
        candidates.push(
            Math.floor(environment.deviceMemoryGiB * 1_024 * (environment.desktop ? 0.03 : 0.02)),
        )
    }

    const candidate = candidates.length > 0 ? Math.min(...candidates) : fallback
    const bounded = Math.max(minimum, Math.min(maximum, candidate))
    return Math.max(minimum, Math.floor(bounded / 16) * 16)
}

export function currentCacheBudgetEnvironment(): CacheBudgetEnvironment {
    if (typeof window === 'undefined') return { desktop: false }

    const performanceMemory = performance as Performance & {
        readonly memory?: { readonly jsHeapSizeLimit?: number }
    }
    const navigatorMemory = navigator as Navigator & { readonly deviceMemory?: number }
    const jsHeapSizeLimit = performanceMemory.memory?.jsHeapSizeLimit

    return {
        desktop: Boolean(window.pruftnet),
        deviceMemoryGiB: navigatorMemory.deviceMemory,
        jsHeapLimitMiB: jsHeapSizeLimit === undefined ? undefined : jsHeapSizeLimit / (1024 * 1024),
    }
}

export function resolvedPacketListCacheMiB(
    settings: AppSettings,
    environment = currentCacheBudgetEnvironment(),
): number {
    return settings.packetListCache.mode === 'manual'
        ? boundedManualCacheMiB(settings.packetListCache.maximumMiB)
        : automaticPacketListCacheMiB(environment)
}

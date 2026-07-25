import { describe, expect, test } from 'vitest'

import {
    automaticPacketListCacheMiB,
    defaultAppSettings,
    parseAppSettings,
    resolvedPacketListCacheMiB,
} from './app-settings'

describe('application settings', () => {
    test('recovers defaults from missing or invalid persisted data', () => {
        expect(parseAppSettings(null)).toEqual(defaultAppSettings)
        expect(parseAppSettings('{')).toEqual(defaultAppSettings)
    })

    test('bounds a persisted manual packet-list cache budget', () => {
        expect(
            parseAppSettings(
                JSON.stringify({
                    packetListCache: { mode: 'manual', maximumMiB: 20_000 },
                }),
            ).packetListCache,
        ).toEqual({ mode: 'manual', maximumMiB: 1_024 })
    })

    test('uses conservative automatic budgets for desktop and web renderers', () => {
        expect(
            automaticPacketListCacheMiB({
                desktop: true,
                deviceMemoryGiB: 16,
                jsHeapLimitMiB: 4_096,
            }),
        ).toBe(320)
        expect(
            automaticPacketListCacheMiB({
                desktop: false,
                deviceMemoryGiB: 8,
                jsHeapLimitMiB: 4_096,
            }),
        ).toBe(160)
    })

    test('manual mode resolves to the selected maximum', () => {
        expect(
            resolvedPacketListCacheMiB(
                { packetListCache: { mode: 'manual', maximumMiB: 512 } },
                { desktop: false },
            ),
        ).toBe(512)
    })
})

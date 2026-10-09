import { CaptureFailure, CaptureRecord, ReplayCaptureSource } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import {
    captureHealth,
    captureNotice,
    formatDuration,
    groupCapturesByDay,
    matchesCaptureFilter,
} from './capture-history'

function msToNs(ms: number) {
    return (BigInt(ms) * 1_000_000n).toString()
}

function capture(overrides: Partial<ConstructorParameters<typeof CaptureRecord>[0]> = {}) {
    return new CaptureRecord({
        captureId: 'a'.repeat(32),
        state: 'stopped',
        source: new ReplayCaptureSource({ fileId: 'file' }),
        interfaceNames: ['en0'],
        sourceFormat: 'pcapng',
        registryRevision: '1',
        startedAtNs: msToNs(new Date(2026, 6, 25, 21, 3).getTime()),
        stoppedAtNs: msToNs(new Date(2026, 6, 25, 21, 12).getTime()),
        packetCount: '10',
        retainedBytes: '1024',
        retainedPortionOnly: false,
        failure: null,
        ...overrides,
    })
}

describe('captureHealth', () => {
    test('classifies live, failed, degraded, and healthy captures', () => {
        expect(captureHealth(capture({ state: 'capturing' }))).toBe('live')
        expect(captureHealth(capture({ state: 'failed' }))).toBe('failed')
        expect(
            captureHealth(
                capture({
                    failure: new CaptureFailure({
                        code: 'E_DISK',
                        message: 'Disk full',
                        recoverable: false,
                    }),
                }),
            ),
        ).toBe('failed')
        expect(captureHealth(capture({ retainedPortionOnly: true }))).toBe('degraded')
        expect(captureHealth(capture({ state: 'interrupted' }))).toBe('degraded')
        expect(captureHealth(capture())).toBe('healthy')
    })

    test('only reports a notice when the capture needs attention', () => {
        expect(captureNotice(capture())).toBeUndefined()
        expect(captureNotice(capture({ retainedPortionOnly: true }))).toBe('Retained portion only')
    })
})

describe('groupCapturesByDay', () => {
    test('sorts newest first and sums retained bytes per local day', () => {
        const morning = capture({
            captureId: 'b'.repeat(32),
            startedAtNs: msToNs(new Date(2026, 6, 25, 9, 0).getTime()),
            retainedBytes: '2048',
        })
        const evening = capture()
        const previousDay = capture({
            captureId: 'c'.repeat(32),
            startedAtNs: msToNs(new Date(2026, 6, 24, 23, 59).getTime()),
        })

        const groups = groupCapturesByDay([previousDay, morning, evening])

        expect(groups.map((group) => group.captures.map((item) => item.captureId))).toEqual([
            ['a'.repeat(32), 'b'.repeat(32)],
            ['c'.repeat(32)],
        ])
        expect(groups[0]?.retainedBytes).toBe(3072n)
    })
})

describe('matchesCaptureFilter', () => {
    test('combines the health filter with the text search', () => {
        const degraded = capture({ retainedPortionOnly: true, interfaceNames: ['en16'] })
        expect(matchesCaptureFilter(degraded, 'issues', 'EN16')).toBe(true)
        expect(matchesCaptureFilter(degraded, 'live', '')).toBe(false)
        expect(matchesCaptureFilter(capture(), 'issues', '')).toBe(false)
    })
})

describe('formatDuration', () => {
    test('uses the largest meaningful unit', () => {
        expect(formatDuration(3)).toBe('3 s')
        expect(formatDuration(512)).toBe('8 min 32')
        expect(formatDuration(3_725)).toBe('1 h 02')
    })
})

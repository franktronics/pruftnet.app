import { describe, expect, test } from 'vitest'

import { PacketDetailHttpError, packetDetailState, packetDetailUrl } from './use-packet-detail'

describe('packetDetailUrl', () => {
    test('preserves Electron authentication query parameters', () => {
        expect(
            packetDetailUrl(
                'a'.repeat(32),
                '7',
                '11',
                '12',
                new URL('http://127.0.0.1:3000/rpc?token=secret'),
            ),
        ).toBe(
            `http://127.0.0.1:3000/capture/${'a'.repeat(32)}/packets/7?token=secret&registryRevision=11&analysisRevision=12`,
        )
    })
})

describe('packetDetailState', () => {
    test.each([
        [425, 'pending'],
        [410, 'evicted'],
        [422, 'invalid'],
        [503, 'unavailable'],
    ] as const)('classifies HTTP %s as %s', (status, kind) => {
        expect(packetDetailState('7', false, undefined, new PacketDetailHttpError(status))).toEqual(
            { kind },
        )
    })
})

import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'

import { RealtimeRpcs } from './api'
import { ApplicationChange, CaptureChange } from './schema'

const captureId = '0123456789abcdef0123456789abcdef'
const instanceId = 'fedcba9876543210fedcba9876543210'

describe('realtime RPC contract', () => {
    test('exposes global and capture-scoped streams', () => {
        expect([...RealtimeRpcs.requests.keys()]).toEqual([
            'WatchApplicationChanges',
            'WatchCaptureChanges',
        ])
    })

    test('validates ready events without losing sequence precision', () => {
        expect(
            Schema.decodeUnknownSync(ApplicationChange)({
                _tag: 'ApplicationStreamReady',
                instanceId,
                sequence: '18446744073709551615',
            }),
        ).toMatchObject({ instanceId, sequence: '18446744073709551615' })
        expect(
            Schema.decodeUnknownSync(CaptureChange)({
                _tag: 'CaptureStreamReady',
                instanceId,
                captureId,
                sequence: '0',
            }),
        ).toMatchObject({ captureId, sequence: '0' })
        expect(() =>
            Schema.decodeUnknownSync(CaptureChange)({
                _tag: 'CaptureStreamReady',
                instanceId: 'invalid',
                captureId,
                sequence: '-1',
            }),
        ).toThrow()
    })
})

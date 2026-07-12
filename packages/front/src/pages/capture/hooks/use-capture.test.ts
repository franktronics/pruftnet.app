import type { CaptureEventBatch } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import { MAX_CAPTURE_EVENTS, mergeCaptureEventBatch, type CaptureEventState } from './use-capture'

const captureId = '0123456789abcdef0123456789abcdef'
const empty: CaptureEventState = { events: [], gap: false }

function batch(cursors: string[], gapBeforeFirst = false): CaptureEventBatch {
    return {
        captureId,
        gapBeforeFirst,
        events: cursors.map((cursor) => ({
            cursor,
            timestampNs: cursor,
            severity: 'info',
            code: 'test',
            message: cursor,
            recoverable: true,
            interfaceId: null,
        })),
    } as CaptureEventBatch
}

describe('mergeCaptureEventBatch', () => {
    test('preserves the latest server cursor and gap across an empty batch', () => {
        const first = mergeCaptureEventBatch(captureId, empty, batch(['1', '2'], true))
        const result = mergeCaptureEventBatch(captureId, first, batch([]))
        expect(result.cursor).toBe('2')
        expect(result.gap).toBe(true)
    })

    test('bounds cached events and records the resulting gap', () => {
        const cursors = Array.from({ length: MAX_CAPTURE_EVENTS + 1 }, (_, index) =>
            String(index + 1),
        )
        const result = mergeCaptureEventBatch(captureId, empty, batch(cursors))
        expect(result.events).toHaveLength(MAX_CAPTURE_EVENTS)
        expect(result.events[0]?.cursor).toBe('2')
        expect(result.cursor).toBe(String(MAX_CAPTURE_EVENTS + 1))
        expect(result.gap).toBe(true)
    })
})

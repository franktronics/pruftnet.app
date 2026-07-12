import { describe, expect, test } from 'vitest'

import { retryTransientFailure } from './query-client'

describe('retryTransientFailure', () => {
    test.each([400, 403, 404, 410])('does not retry HTTP %s', (status) => {
        expect(retryTransientFailure(0, { status })).toBe(false)
    })

    test('retries 503 and network failures once', () => {
        expect(retryTransientFailure(0, { status: 503 })).toBe(true)
        expect(retryTransientFailure(0, new TypeError('fetch failed'))).toBe(true)
        expect(retryTransientFailure(1, { status: 503 })).toBe(false)
    })

    test.each(['PacketDetailContentTypeError', 'PacketDetailKeyError', 'PacketDetailInvalidError'])(
        'does not retry %s',
        (name) => {
            const error = Object.assign(new Error('invalid detail'), { constructor: { name } })
            expect(retryTransientFailure(0, error)).toBe(false)
        },
    )
})

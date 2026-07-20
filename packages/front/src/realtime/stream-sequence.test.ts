import { describe, expect, test } from 'vitest'

import { hasSequenceGap, heartbeatRequiresReconciliation } from './stream-sequence'

describe('stream sequence reconciliation', () => {
    test('treats one unseen event reported by a heartbeat as a reconciliation trigger', () => {
        expect(heartbeatRequiresReconciliation('instance', 4n, 'instance', 5n)).toBe(true)
        expect(heartbeatRequiresReconciliation('instance', 5n, 'instance', 5n)).toBe(false)
    })

    test('reconciles backend instance changes and event sequence gaps', () => {
        expect(heartbeatRequiresReconciliation('old', 5n, 'new', 0n)).toBe(true)
        expect(hasSequenceGap(5n, 6n)).toBe(false)
        expect(hasSequenceGap(5n, 7n)).toBe(true)
    })
})

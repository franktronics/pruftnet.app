import { describe, expect, test } from 'vitest'

import { packetDetailUrl } from './use-packet-detail'

describe('packetDetailUrl', () => {
    test('preserves Electron authentication query parameters', () => {
        expect(
            packetDetailUrl('a'.repeat(32), '7', new URL('http://127.0.0.1:3000/rpc?token=secret')),
        ).toBe(`http://127.0.0.1:3000/capture/${'a'.repeat(32)}/packets/7?token=secret`)
    })
})

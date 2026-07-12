import { describe, expect, it, vi } from 'vitest'

import { copyText } from './copy-text'

describe('copyText', () => {
    it('uses the Clipboard API when available', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        expect(await copyText('value', { writeText }, vi.fn())).toBe(true)
        expect(writeText).toHaveBeenCalledWith('value')
    })

    it('uses the fallback when clipboard permission is denied', async () => {
        const fallback = vi.fn().mockReturnValue(true)
        const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
        expect(await copyText('value', clipboard, fallback)).toBe(true)
        expect(fallback).toHaveBeenCalledWith('value')
    })

    it('reports failure when neither copy method succeeds', async () => {
        expect(await copyText('value', undefined, () => false)).toBe(false)
    })
})

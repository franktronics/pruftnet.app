import { afterEach, describe, expect, test, vi } from 'vitest'

import { formatShortcut } from './shortcut-format'

afterEach(() => vi.unstubAllGlobals())

describe('formatShortcut', () => {
    test('uses macOS symbols', () => {
        vi.stubGlobal('window', { pruftnet: { platform: 'darwin' } })
        expect(formatShortcut('Mod+Shift+E')).toBe('⌘⇧E')
        expect(formatShortcut('Ctrl+Mod+F')).toBe('⌃⌘F')
    })

    test('uses Windows and Linux names', () => {
        vi.stubGlobal('window', { pruftnet: { platform: 'win32' } })
        expect(formatShortcut('Mod+Shift+E')).toBe('Ctrl+Shift+E')
        expect(formatShortcut('Alt+Left')).toBe('Alt+←')
    })
})

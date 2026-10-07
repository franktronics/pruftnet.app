import { describe, expect, test } from 'vitest'

import {
    applicationCommandIds,
    applicationCommands,
    electronAccelerator,
    isApplicationCommandStateSnapshot,
    resolveCaptureCycleCommand,
    shortcutKeys,
} from './app-command'

describe('application commands', () => {
    test('defines every command exactly once', () => {
        expect(new Set(applicationCommands.map(({ id }) => id)).size).toBe(
            applicationCommandIds.length,
        )
    })

    test('renders shortcut keys for macOS and other platforms', () => {
        expect(shortcutKeys('Mod+Shift+E', true)).toEqual(['⌘', '⇧', 'E'])
        expect(shortcutKeys('Mod+Shift+E', false)).toEqual(['Ctrl', 'Shift', 'E'])
        expect(shortcutKeys('Alt+Left', true)).toEqual(['⌥', '←'])
    })

    test('converts portable shortcuts to Electron accelerators', () => {
        expect(electronAccelerator('Mod+Shift+E')).toBe('CommandOrControl+Shift+E')
        expect(electronAccelerator('Alt+Left')).toBe('Alt+Left')
    })

    test('validates renderer state snapshots', () => {
        expect(isApplicationCommandStateSnapshot({ history: { enabled: true } })).toBe(true)
        expect(isApplicationCommandStateSnapshot({ unknown: { enabled: true } })).toBe(false)
        expect(isApplicationCommandStateSnapshot({ history: { enabled: 'yes' } })).toBe(false)
    })

    test('resolves the dynamic capture command', () => {
        expect(resolveCaptureCycleCommand({ 'start-capture': { enabled: true } })).toEqual({
            commandId: 'start-capture',
            enabled: true,
            label: 'Start Capture',
        })
        expect(resolveCaptureCycleCommand({ 'stop-capture': { enabled: true } })).toEqual({
            commandId: 'stop-capture',
            enabled: true,
            label: 'Stop Capture',
        })
        expect(
            resolveCaptureCycleCommand({
                'stop-capture': { enabled: false, pending: true },
            }),
        ).toEqual({
            commandId: 'stop-capture',
            enabled: false,
            label: 'Stopping Capture…',
        })
    })
})

import { describe, expect, test } from 'vitest'

import {
    applicationCommandIds,
    applicationCommands,
    electronAccelerator,
    isApplicationCommandStateSnapshot,
    resolveCaptureCycleCommand,
} from './app-command'

describe('application commands', () => {
    test('defines every command exactly once', () => {
        expect(new Set(applicationCommands.map(({ id }) => id)).size).toBe(
            applicationCommandIds.length,
        )
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

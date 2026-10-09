import { describe, expect, it } from 'vitest'

import { matchSettingsSections, settingsSectionFromPath } from './settings-sections'

describe('settingsSectionFromPath', () => {
    it('resolves a known section', () => {
        expect(settingsSectionFromPath('/settings/keyboard')?.id).toBe('keyboard')
    })

    it('falls back to the default section inside Settings', () => {
        expect(settingsSectionFromPath('/settings')?.id).toBe('general')
        expect(settingsSectionFromPath('/settings/unknown')?.id).toBe('general')
    })

    it('ignores pages outside Settings', () => {
        expect(settingsSectionFromPath('/captures')).toBeUndefined()
        expect(settingsSectionFromPath('/settings-archive')).toBeUndefined()
    })
})

describe('matchSettingsSections', () => {
    it('returns every section for an empty query', () => {
        expect(matchSettingsSections('  ')).toHaveLength(4)
    })

    it('matches labels and keywords case-insensitively', () => {
        expect(matchSettingsSections('DARK').map((section) => section.id)).toEqual(['general'])
        expect(matchSettingsSections('cache').map((section) => section.id)).toEqual(['performance'])
    })
})

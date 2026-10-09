import { useParams } from '@tanstack/react-router'
import type { ComponentType } from 'react'

import { GeneralSettings } from './general-settings'
import { KeyboardShortcutsSettings } from './keyboard-shortcuts-settings'
import { PerformanceSettings } from './performance-settings'
import {
    defaultSettingsSection,
    findSettingsSection,
    type SettingsSectionId,
} from './settings-sections'
import { StorageSettings } from './storage-settings'

const sectionContent: Record<SettingsSectionId, ComponentType> = {
    general: GeneralSettings,
    keyboard: KeyboardShortcutsSettings,
    performance: PerformanceSettings,
    storage: StorageSettings,
}

export function SettingsPage() {
    const { section: sectionId } = useParams({ from: '/settings/$section' })
    const section = findSettingsSection(sectionId) ?? findSettingsSection(defaultSettingsSection)!
    const Content = sectionContent[section.id]

    return (
        <div className="min-h-0 flex-1 overflow-y-auto">
            <section
                aria-labelledby="settings-section-title"
                className="mx-auto grid w-full max-w-2xl gap-10 px-6 pt-10 pb-16"
            >
                <h1 id="settings-section-title" className="text-xl font-semibold tracking-tight">
                    {section.label}
                </h1>
                {/* Keyed so per-section state such as filters resets when switching sections. */}
                <Content key={section.id} />
            </section>
        </div>
    )
}

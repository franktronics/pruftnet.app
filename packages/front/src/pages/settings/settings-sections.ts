import { Database, Gauge, Keyboard, Settings2, type LucideIcon } from 'lucide-react'

export const settingsSectionGroups = ['Application', 'Capture'] as const

export interface SettingsSectionDefinition {
    readonly id: string
    readonly group: (typeof settingsSectionGroups)[number]
    readonly label: string
    readonly description: string
    readonly icon: LucideIcon
    /** Extra search terms for settings that the label and description do not name. */
    readonly keywords: readonly string[]
}

export const settingsSections = [
    {
        id: 'general',
        group: 'Application',
        label: 'General',
        description: 'Appearance and application-wide preferences.',
        icon: Settings2,
        keywords: ['appearance', 'theme', 'dark', 'light', 'system', 'mode', 'reset', 'defaults'],
    },
    {
        id: 'keyboard',
        group: 'Application',
        label: 'Keyboard shortcuts',
        description: 'Shortcuts follow platform conventions and are not currently customizable.',
        icon: Keyboard,
        keywords: ['shortcut', 'hotkey', 'keys', 'accelerator'],
    },
    {
        id: 'performance',
        group: 'Capture',
        label: 'Performance',
        description: 'Memory used to keep decoded packet-list pages ready.',
        icon: Gauge,
        keywords: ['cache', 'memory', 'packet list', 'eviction'],
    },
    {
        id: 'storage',
        group: 'Capture',
        label: 'Storage',
        description: 'Where captures, summaries, and exports are kept.',
        icon: Database,
        keywords: ['capture', 'retention', 'disk', 'files', 'export'],
    },
] as const satisfies readonly SettingsSectionDefinition[]

export type SettingsSectionId = (typeof settingsSections)[number]['id']

export const defaultSettingsSection: SettingsSectionId = 'general'

export function findSettingsSection(id: string | undefined) {
    return settingsSections.find((section) => section.id === id)
}

/** Resolves the section of a `/settings/<id>` pathname, or undefined outside Settings. */
export function settingsSectionFromPath(pathname: string) {
    const match = /^\/settings(?:\/([^/]+))?\/?$/.exec(pathname)
    if (!match) return undefined
    return findSettingsSection(match[1]) ?? findSettingsSection(defaultSettingsSection)
}

export function matchSettingsSections(query: string): readonly SettingsSectionDefinition[] {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return settingsSections
    return settingsSections.filter((section) =>
        [section.label, section.description, ...section.keywords].some((value) =>
            value.toLocaleLowerCase().includes(needle),
        ),
    )
}

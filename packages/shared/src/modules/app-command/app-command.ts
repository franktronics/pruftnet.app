export const applicationCommandIds = [
    'command-palette',
    'new-capture',
    'start-capture',
    'stop-capture',
    'capture-settings',
    'export-capture',
    'discard-active-capture',
    'active-capture',
    'capture-workspace',
    'history',
    'settings',
    'back',
    'toggle-sidebar',
    'keyboard-shortcuts',
] as const

export type ApplicationCommandId = (typeof applicationCommandIds)[number]
export type ApplicationCommandCategory = 'application' | 'capture' | 'navigation' | 'view'

export interface ApplicationCommandDefinition {
    readonly id: ApplicationCommandId
    readonly label: string
    readonly description: string
    readonly category: ApplicationCommandCategory
    readonly keywords?: readonly string[]
    readonly shortcut?: string
    readonly desktopOnly?: boolean
    readonly destructive?: boolean
}

export interface ApplicationCommandState {
    readonly enabled: boolean
    readonly pending?: boolean
    readonly label?: string
    readonly disabledReason?: string
}

export type ApplicationCommandStateSnapshot = Partial<
    Record<ApplicationCommandId, ApplicationCommandState>
>

export const applicationCommands: readonly ApplicationCommandDefinition[] = [
    {
        id: 'command-palette',
        label: 'Command Palette',
        description: 'Search for and run an application command.',
        category: 'application',
        keywords: ['search', 'actions'],
        shortcut: 'Mod+K',
    },
    {
        id: 'new-capture',
        label: 'New Capture',
        description: 'Open an empty capture workspace.',
        category: 'capture',
        keywords: ['packet', 'network'],
        shortcut: 'Mod+N',
    },
    {
        id: 'start-capture',
        label: 'Start Capture',
        description: 'Start capturing on the selected network interfaces.',
        category: 'capture',
        shortcut: 'Mod+E',
    },
    {
        id: 'stop-capture',
        label: 'Stop Capture',
        description: 'Stop and retain the active capture.',
        category: 'capture',
        shortcut: 'Mod+E',
    },
    {
        id: 'capture-settings',
        label: 'Capture Settings',
        description: 'Configure interfaces and capture parameters.',
        category: 'capture',
    },
    {
        id: 'export-capture',
        label: 'Export Capture',
        description: 'Export the displayed or active capture.',
        category: 'capture',
        shortcut: 'Mod+Shift+E',
    },
    {
        id: 'discard-active-capture',
        label: 'Stop and Discard Current Capture',
        description: 'Stop the active capture and permanently remove its retained data.',
        category: 'capture',
        destructive: true,
    },
    {
        id: 'active-capture',
        label: 'Go to Active Capture',
        description: 'Open the capture currently in progress.',
        category: 'capture',
    },
    {
        id: 'capture-workspace',
        label: 'Capture Workspace',
        description: 'Open the main capture workspace.',
        category: 'navigation',
        shortcut: 'Mod+1',
    },
    {
        id: 'history',
        label: 'History',
        description: 'Browse retained captures.',
        category: 'navigation',
        shortcut: 'Mod+2',
    },
    {
        id: 'settings',
        label: 'Settings',
        description: 'Open application settings.',
        category: 'navigation',
        shortcut: 'Mod+,',
    },
    {
        id: 'back',
        label: 'Back',
        description: 'Return to the previous location.',
        category: 'navigation',
        shortcut: 'Alt+Left',
    },
    {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        description: 'Show or hide the application sidebar.',
        category: 'view',
        shortcut: 'Mod+B',
    },
    {
        id: 'keyboard-shortcuts',
        label: 'Keyboard Shortcuts',
        description: 'Review all available keyboard shortcuts.',
        category: 'application',
    },
]

const applicationCommandIdSet = new Set<string>(applicationCommandIds)

export function isApplicationCommandId(value: unknown): value is ApplicationCommandId {
    return typeof value === 'string' && applicationCommandIdSet.has(value)
}

export function isApplicationCommandStateSnapshot(
    value: unknown,
): value is ApplicationCommandStateSnapshot {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

    return Object.entries(value).every(([id, state]) => {
        if (!isApplicationCommandId(id) || typeof state !== 'object' || state === null) return false
        const candidate = state as Record<string, unknown>
        if (
            Object.keys(candidate).some(
                (key) =>
                    key !== 'enabled' &&
                    key !== 'pending' &&
                    key !== 'label' &&
                    key !== 'disabledReason',
            )
        ) {
            return false
        }
        return (
            typeof candidate.enabled === 'boolean' &&
            (candidate.pending === undefined || typeof candidate.pending === 'boolean') &&
            (candidate.label === undefined ||
                (typeof candidate.label === 'string' && candidate.label.length <= 160)) &&
            (candidate.disabledReason === undefined ||
                (typeof candidate.disabledReason === 'string' &&
                    candidate.disabledReason.length <= 240))
        )
    })
}

export function electronAccelerator(shortcut: string): string {
    return shortcut.replace('Mod', 'CommandOrControl')
}

export interface CaptureCycleCommandState {
    readonly commandId: 'start-capture' | 'stop-capture'
    readonly enabled: boolean
    readonly label: string
}

export function resolveCaptureCycleCommand(
    snapshot: ApplicationCommandStateSnapshot,
): CaptureCycleCommandState {
    const start = snapshot['start-capture'] ?? { enabled: false }
    const stop = snapshot['stop-capture'] ?? { enabled: false }
    const commandId = stop.enabled || stop.pending ? 'stop-capture' : 'start-capture'
    return {
        commandId,
        enabled: (start.enabled || stop.enabled) && !start.pending && !stop.pending,
        label: start.pending
            ? 'Starting Capture…'
            : stop.pending
              ? 'Stopping Capture…'
              : commandId === 'stop-capture'
                ? 'Stop Capture'
                : 'Start Capture',
    }
}

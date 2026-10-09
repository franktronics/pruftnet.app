import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

import type { Theme } from './theme'

/** Display metadata shared by every theme picker. */
export const themeOptions: ReadonlyArray<{
    readonly label: string
    readonly value: Theme
    readonly icon: LucideIcon
}> = [
    { label: 'System', value: 'system', icon: Monitor },
    { label: 'Light', value: 'light', icon: Sun },
    { label: 'Dark', value: 'dark', icon: Moon },
]

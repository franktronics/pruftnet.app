import { shortcutKeys } from '@repo/shared/app-command'

export function isMacPlatform() {
    if (typeof window === 'undefined') return false
    const platform = window.pruftnet?.platform ?? navigator.platform
    return platform === 'darwin' || /mac/i.test(platform)
}

export function formatShortcut(shortcut: string) {
    const mac = isMacPlatform()
    return shortcutKeys(shortcut, mac).join(mac ? '' : '+')
}

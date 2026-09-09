export function isMacPlatform() {
    if (typeof window === 'undefined') return false
    const platform = window.pruftnet?.platform ?? navigator.platform
    return platform === 'darwin' || /mac/i.test(platform)
}

export function formatShortcut(shortcut: string) {
    const mac = isMacPlatform()
    return shortcut
        .split('+')
        .map((part) => {
            if (part === 'Mod') return mac ? '⌘' : 'Ctrl'
            if (part === 'Ctrl') return mac ? '⌃' : 'Ctrl'
            if (part === 'Alt') return mac ? '⌥' : 'Alt'
            if (part === 'Shift') return mac ? '⇧' : 'Shift'
            if (part === 'Left') return '←'
            if (part === 'Plus') return '+'
            return part.toUpperCase()
        })
        .join(mac ? '' : '+')
}

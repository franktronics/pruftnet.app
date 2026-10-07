import type { Platform } from '#site/releases/assets'

interface NavigatorWithHints extends Navigator {
    userAgentData?: { platform?: string }
}

/** Best-effort desktop platform of the visitor; null on mobile or unknown systems. */
export function detectPlatform(): Platform | null {
    const nav = navigator as NavigatorWithHints
    const hint = (nav.userAgentData?.platform ?? nav.userAgent).toLowerCase()
    if (/iphone|ipad|android/.test(nav.userAgent.toLowerCase())) return null
    if (hint.includes('mac')) return 'macos'
    if (hint.includes('win')) return 'windows'
    if (hint.includes('linux') || hint.includes('x11')) return 'linux'
    return null
}

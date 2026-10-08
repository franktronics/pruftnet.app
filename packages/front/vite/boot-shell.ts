import type { Plugin } from 'vite'
import { SIDEBAR_STORAGE_KEY } from '@repo/ui/sidebar-storage'

// Explicit extension: other packages' Vite configs load this module through Node directly.
import { themeStorageKey } from '#front/theme/theme.ts'

// Runs before first paint, so it must stay dependency free. It mirrors what ThemeProvider and
// the desktop layout apply after React mounts, which keeps the first frame in the final theme.
function applyStartupState(themeKey: string, sidebarKey: string) {
    const root = document.documentElement
    let theme: string | null = null
    let sidebarOpen: string | null = null
    try {
        theme = localStorage.getItem(themeKey)
        sidebarOpen = localStorage.getItem(sidebarKey)
    } catch {
        // Storage can be unavailable; the shell then follows the system theme.
    }
    const dark =
        theme === 'dark' ||
        (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.add(dark ? 'dark' : 'light')
    const desktop = (window as { pruftnet?: { platform: string } }).pruftnet
    if (desktop) root.dataset.desktopPlatform = desktop.platform
    if (sidebarOpen === 'false') root.dataset.startupSidebar = 'collapsed'
}

const startupShell =
    '<div class="startup-shell" aria-hidden="true">' +
    '<div class="startup-shell-sidebar"></div><div class="startup-shell-main"></div></div>'

/**
 * Paints the application frame from the render-blocking stylesheet, before the JavaScript bundle
 * runs. React replaces the shell when it renders into `#root`.
 */
export function startupShellPlugin(): Plugin {
    return {
        name: 'pruftnet-startup-shell',
        transformIndexHtml(html) {
            return {
                html: html.replace('<div id="root"></div>', `<div id="root">${startupShell}</div>`),
                tags: [
                    {
                        tag: 'script',
                        children: `(${applyStartupState.toString()})(${JSON.stringify(themeStorageKey)}, ${JSON.stringify(SIDEBAR_STORAGE_KEY)})`,
                        injectTo: 'head-prepend',
                    },
                ],
            }
        },
    }
}

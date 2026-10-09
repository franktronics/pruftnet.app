import { settingsSectionFromPath } from './settings/settings-sections'

/**
 * Pages reached from the capture workspace. They share one navigation model: the title bar
 * shows a back button and the page title, and back returns to the location the page was
 * entered from, however many in-page locations (such as settings sections) were visited.
 */
export const secondaryPages = [
    {
        id: 'history',
        title: 'History',
        matches: (pathname: string) =>
            pathname === '/captures' || pathname.startsWith('/captures/'),
    },
    {
        id: 'settings',
        title: 'Settings',
        matches: (pathname: string) => settingsSectionFromPath(pathname) !== undefined,
    },
] as const

export type SecondaryPageId = (typeof secondaryPages)[number]['id']

export function findSecondaryPage(pathname: string) {
    return secondaryPages.find((page) => page.matches(pathname))
}

export interface SecondaryPageEntry {
    readonly page: SecondaryPageId
    readonly returnHref: string
}

/**
 * Advances the stack of open secondary pages after a navigation to `pathname`. Returning to a
 * page already on the stack unwinds to it, so back never ping-pongs between two pages, and
 * reaching the workspace clears the stack.
 */
export function nextSecondaryPageStack(
    stack: readonly SecondaryPageEntry[],
    previousHref: string | undefined,
    pathname: string,
): readonly SecondaryPageEntry[] {
    const page = findSecondaryPage(pathname)
    if (!page) return []
    const index = stack.findIndex((entry) => entry.page === page.id)
    if (index >= 0) return stack.slice(0, index + 1)
    return [...stack, { page: page.id, returnHref: previousHref ?? '/' }]
}

export function secondaryPageReturnHref(stack: readonly SecondaryPageEntry[]) {
    return stack.at(-1)?.returnHref ?? '/'
}

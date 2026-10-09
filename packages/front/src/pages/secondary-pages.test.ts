import { describe, expect, it } from 'vitest'

import {
    nextSecondaryPageStack,
    secondaryPageReturnHref,
    type SecondaryPageEntry,
} from './secondary-pages'

function visit(paths: readonly string[]) {
    let stack: readonly SecondaryPageEntry[] = []
    let previous: string | undefined
    for (const path of paths) {
        stack = nextSecondaryPageStack(stack, previous, path)
        previous = path
    }
    return stack
}

describe('secondary page navigation', () => {
    it('returns to the location the page was entered from', () => {
        const stack = visit(['/capture/a', '/settings/general', '/settings/keyboard'])
        expect(secondaryPageReturnHref(stack)).toBe('/capture/a')
    })

    it('unwinds instead of alternating between two secondary pages', () => {
        const stack = visit(['/capture/a', '/captures', '/settings/general', '/captures'])
        expect(stack.map((entry) => entry.page)).toEqual(['history'])
        expect(secondaryPageReturnHref(stack)).toBe('/capture/a')
    })

    it('returns to a nested secondary page first', () => {
        const stack = visit(['/', '/captures', '/settings/storage'])
        expect(secondaryPageReturnHref(stack)).toBe('/captures')
    })

    it('clears the stack in the workspace and falls back to it on direct entry', () => {
        expect(visit(['/captures', '/capture/a'])).toEqual([])
        expect(secondaryPageReturnHref(visit(['/settings/general']))).toBe('/')
    })
})

import { describe, expect, test } from 'vitest'

import { paginate } from './pagination'

describe('paginate', () => {
    const items = Array.from({ length: 120 }, (_, index) => index)

    test('slices the requested page and reports its bounds', () => {
        const page = paginate(items, 2, 50)
        expect(page.items).toHaveLength(50)
        expect(page).toMatchObject({ page: 2, pageCount: 3, firstIndex: 51, lastIndex: 100 })
    })

    test('clamps a page that no longer exists', () => {
        expect(paginate(items, 9, 50)).toMatchObject({ page: 3, firstIndex: 101, lastIndex: 120 })
        expect(paginate([], 4, 50)).toMatchObject({ page: 1, pageCount: 1, firstIndex: 0 })
    })
})

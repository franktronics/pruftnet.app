export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export interface Page<T> {
    items: T[]
    /** 1-based page actually shown, clamped to the available range. */
    page: number
    pageCount: number
    /** 1-based index of the first item on the page, or 0 when there are no items. */
    firstIndex: number
    lastIndex: number
    total: number
}

/** Slices one page out of `items`, clamping a stale page number after the list shrinks. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
    const total = items.length
    const pageCount = Math.max(1, Math.ceil(total / pageSize))
    const current = Math.min(Math.max(1, page), pageCount)
    const start = (current - 1) * pageSize
    const pageItems = items.slice(start, start + pageSize)
    return {
        items: pageItems,
        page: current,
        pageCount,
        firstIndex: total === 0 ? 0 : start + 1,
        lastIndex: start + pageItems.length,
        total,
    }
}

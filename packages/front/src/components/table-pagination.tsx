import { Button, NativeSelect, NativeSelectOption } from '@repo/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { type Page, PAGE_SIZE_OPTIONS } from './pagination'

/** 40 px footer for paginated data tables: range, page size, and previous/next controls. */
export function TablePagination({
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    label,
}: {
    page: Page<unknown>
    pageSize: number
    onPageChange: (page: number) => void
    onPageSizeChange: (pageSize: number) => void
    /** Accessible name of the paginated collection, e.g. "Captures". */
    label: string
}) {
    return (
        <nav
            aria-label={`${label} pagination`}
            className="bg-background text-muted-foreground flex h-10 shrink-0 items-center gap-3 border-t px-3 text-xs"
        >
            <span aria-live="polite" className="tabular-nums">
                {page.firstIndex.toLocaleString()}–{page.lastIndex.toLocaleString()} of{' '}
                {page.total.toLocaleString()}
            </span>
            <label className="ml-auto flex items-center gap-2">
                Rows
                <NativeSelect
                    value={String(pageSize)}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                    className="w-16"
                >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                        <NativeSelectOption key={option} value={String(option)}>
                            {option}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </label>
            <div className="flex items-center gap-1">
                <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Previous page"
                    disabled={page.page <= 1}
                    onClick={() => onPageChange(page.page - 1)}
                >
                    <ChevronLeft />
                </Button>
                <span className="min-w-12 text-center tabular-nums">
                    {page.page} / {page.pageCount}
                </span>
                <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Next page"
                    disabled={page.page >= page.pageCount}
                    onClick={() => onPageChange(page.page + 1)}
                >
                    <ChevronRight />
                </Button>
            </div>
        </nav>
    )
}

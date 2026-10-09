import { Button, Input } from '@repo/ui'
import { Search, X } from 'lucide-react'
import type { ReactNode } from 'react'

/** Full-width 40 px search toolbar shared by data-dense pages; extra controls go in `children`. */
export function ToolbarSearch({
    value,
    onChange,
    label,
    placeholder,
    count,
    countTitle,
    children,
}: {
    value: string
    onChange: (value: string) => void
    label: string
    placeholder: string
    count?: ReactNode
    countTitle?: string
    children?: ReactNode
}) {
    return (
        <div className="bg-background flex h-10 shrink-0 items-center gap-2.5 border-b px-3">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <Input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label={label}
                placeholder={placeholder}
                spellCheck={false}
                className="border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {count !== undefined ? (
                <span
                    aria-live="polite"
                    title={countTitle}
                    className="text-muted-foreground hidden shrink-0 text-xs tabular-nums sm:inline"
                >
                    {count}
                </span>
            ) : null}
            {value ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Clear ${label.toLowerCase()}`}
                    onClick={() => onChange('')}
                >
                    <X />
                </Button>
            ) : null}
            {children}
        </div>
    )
}

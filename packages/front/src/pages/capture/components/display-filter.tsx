import { Button, Input } from '@repo/ui'
import { Search, X } from 'lucide-react'

export function DisplayFilter({
    value,
    onChange,
}: {
    value: string
    onChange: (value: string) => void
}) {
    return (
        <div className="bg-background flex h-11 shrink-0 items-center gap-3 border-b px-3">
            <Search className="text-muted-foreground size-4" />
            <Input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                aria-label="Display filter"
                placeholder="Filter displayed packets..."
                spellCheck={false}
                className="border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            {value ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Clear display filter"
                    onClick={() => onChange('')}
                >
                    <X />
                </Button>
            ) : null}
        </div>
    )
}

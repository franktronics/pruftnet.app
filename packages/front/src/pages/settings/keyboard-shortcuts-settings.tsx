import { useMemo, useState } from 'react'
import { Keyboard, Search } from 'lucide-react'

import { applicationCommands } from '@repo/shared/app-command'
import { Input, Kbd } from '@repo/ui/atoms'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/molecules'

import { formatShortcut, isMacPlatform } from '#front/commands/shortcut-format'

const standardShortcuts = [
    ['Undo', 'Undo the last editing operation.', 'Editing', 'Mod+Z'],
    ['Redo', 'Redo the last editing operation.', 'Editing', 'redo'],
    ['Cut', 'Cut the current selection.', 'Editing', 'Mod+X'],
    ['Copy', 'Copy the current selection.', 'Editing', 'Mod+C'],
    ['Paste', 'Paste from the clipboard.', 'Editing', 'Mod+V'],
    ['Select All', 'Select all content in the focused control.', 'Editing', 'Mod+A'],
    ['Reset Zoom', 'Restore the default interface zoom.', 'Window', 'Mod+0'],
    ['Zoom In', 'Increase the interface zoom.', 'Window', 'Mod+Plus'],
    ['Zoom Out', 'Decrease the interface zoom.', 'Window', 'Mod+-'],
    ['Full Screen', 'Enter or leave full screen.', 'Window', 'fullscreen'],
] as const

type ShortcutRow = {
    readonly category: string
    readonly description: string
    readonly label: string
    readonly shortcut: string
}

function resolvedStandardShortcuts(): readonly ShortcutRow[] {
    const mac = isMacPlatform()
    return standardShortcuts.map(([label, description, category, shortcut]) => ({
        label,
        description,
        category,
        shortcut:
            shortcut === 'redo'
                ? mac
                    ? 'Mod+Shift+Z'
                    : 'Mod+Y'
                : shortcut === 'fullscreen'
                  ? mac
                      ? 'Ctrl+Mod+F'
                      : 'F11'
                  : shortcut,
    }))
}

export function KeyboardShortcutsSettings() {
    const [search, setSearch] = useState('')
    const rows = useMemo<readonly ShortcutRow[]>(
        () => [
            ...applicationCommands
                .filter((command) => command.shortcut)
                .map((command) => ({
                    category: command.category[0]!.toUpperCase() + command.category.slice(1),
                    description: command.description,
                    label: command.label,
                    shortcut: command.shortcut!,
                })),
            ...resolvedStandardShortcuts(),
        ],
        [],
    )
    const needle = search.trim().toLocaleLowerCase()
    const visibleRows = rows.filter((row) =>
        [row.label, row.description, row.category, row.shortcut].some((value) =>
            value.toLocaleLowerCase().includes(needle),
        ),
    )
    const categories = [...new Set(visibleRows.map((row) => row.category))]

    return (
        <Card id="keyboard" tabIndex={-1}>
            <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                    <Keyboard className="text-muted-foreground size-4" />
                    Keyboard shortcuts
                </CardTitle>
                <CardDescription>
                    Shortcuts follow platform conventions and are not currently customizable.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <label className="relative block">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search shortcuts"
                        className="pl-8"
                    />
                    <span className="sr-only">Search keyboard shortcuts</span>
                </label>
                {categories.map((category) => (
                    <section key={category} aria-labelledby={`keyboard-category-${category}`}>
                        <h3
                            id={`keyboard-category-${category}`}
                            className="text-muted-foreground mb-1.5 text-xs font-semibold"
                        >
                            {category}
                        </h3>
                        <div className="divide-y rounded-md border">
                            {visibleRows
                                .filter((row) => row.category === category)
                                .map((row) => (
                                    <div
                                        key={`${row.category}-${row.label}`}
                                        className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                                    >
                                        <div>
                                            <div className="text-sm font-medium">{row.label}</div>
                                            <div className="text-muted-foreground text-xs">
                                                {row.description}
                                            </div>
                                        </div>
                                        <Kbd>{formatShortcut(row.shortcut)}</Kbd>
                                    </div>
                                ))}
                        </div>
                    </section>
                ))}
                {visibleRows.length === 0 ? (
                    <p className="text-muted-foreground py-6 text-center text-sm" role="status">
                        No shortcuts match this search.
                    </p>
                ) : null}
            </CardContent>
        </Card>
    )
}

import type { CaptureRecord } from '@repo/shared/capture'
import {
    Button,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@repo/ui'
import { Copy, Ellipsis, FileOutput, FolderOpen, type LucideIcon, Trash2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

import { isLiveCapture } from './capture-history'

export interface CaptureActionHandlers {
    onOpen: (capture: CaptureRecord) => void
    onExport: (capture: CaptureRecord) => void
    onCopyId: (capture: CaptureRecord) => void
    onDelete: (capture: CaptureRecord) => void
}

interface CaptureAction {
    key: string
    label: string
    icon: LucideIcon
    run: () => void
    disabled?: boolean
    destructive?: boolean
    /** Starts a new visual section in menus. */
    separated?: boolean
}

/** Single source of truth for capture actions, so the row menu, context menu, and panel agree. */
export function captureActions(
    capture: CaptureRecord,
    handlers: CaptureActionHandlers,
): CaptureAction[] {
    return [
        { key: 'open', label: 'Open', icon: FolderOpen, run: () => handlers.onOpen(capture) },
        {
            key: 'export',
            label: 'Export…',
            icon: FileOutput,
            run: () => handlers.onExport(capture),
        },
        {
            key: 'copy-id',
            label: 'Copy capture ID',
            icon: Copy,
            run: () => handlers.onCopyId(capture),
        },
        {
            key: 'delete',
            label: 'Delete…',
            icon: Trash2,
            run: () => handlers.onDelete(capture),
            // A running capture still owns its segments; it must be stopped first.
            disabled: isLiveCapture(capture),
            destructive: true,
            separated: true,
        },
    ]
}

export function CaptureContextMenu({
    capture,
    handlers,
    children,
}: {
    capture: CaptureRecord
    handlers: CaptureActionHandlers
    children: ReactNode
}) {
    return (
        <ContextMenu>
            {/* A wrapper keeps the row's own pointer and keyboard handlers intact. */}
            <ContextMenuTrigger>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-44">
                {captureActions(capture, handlers).map((action) => (
                    <Fragment key={action.key}>
                        {action.separated ? <ContextMenuSeparator /> : null}
                        <ContextMenuItem
                            variant={action.destructive ? 'destructive' : 'default'}
                            disabled={action.disabled}
                            onClick={action.run}
                        >
                            <action.icon />
                            {action.label}
                        </ContextMenuItem>
                    </Fragment>
                ))}
            </ContextMenuContent>
        </ContextMenu>
    )
}

/** Overflow menu for the actions that do not deserve a dedicated button. */
export function CaptureMoreMenu({
    capture,
    handlers,
    exclude = [],
    className,
}: {
    capture: CaptureRecord
    handlers: CaptureActionHandlers
    exclude?: string[]
    className?: string
}) {
    const actions = captureActions(capture, handlers).filter(
        (action) => !exclude.includes(action.key),
    )
    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="More capture actions"
                        className={className}
                    >
                        <Ellipsis />
                    </Button>
                }
            />
            <DropdownMenuContent align="end" className="w-44">
                {actions.map((action, index) => (
                    <Fragment key={action.key}>
                        {action.separated && index > 0 ? <DropdownMenuSeparator /> : null}
                        <DropdownMenuItem
                            variant={action.destructive ? 'destructive' : 'default'}
                            disabled={action.disabled}
                            onClick={action.run}
                        >
                            <action.icon />
                            {action.label}
                        </DropdownMenuItem>
                    </Fragment>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

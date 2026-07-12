import { Link } from '@tanstack/react-router'
import { ArrowLeft, Pause, Play, RotateCcw, Square } from 'lucide-react'

import { Button, Separator } from '@repo/ui/atoms'

export function ReplayToolbar({
    captureId,
    state,
    following,
    onFollowingChange,
    onStop,
    onRestart,
    stopping,
    restarting,
    error,
    warning,
}: {
    captureId: string
    state?: string
    following: boolean
    onFollowingChange: (value: boolean) => void
    onStop: () => void
    onRestart: () => void
    stopping: boolean
    restarting: boolean
    error?: unknown
    warning?: string
}) {
    const active = state === 'running' || state === 'starting' || state === 'stopping'
    return (
        <header
            className="bg-background flex h-11 shrink-0 items-center gap-1 border-b px-2"
            aria-label="Replay controls"
        >
            <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Back to captures"
                nativeButton={false}
                render={<Link to="/" />}
            >
                <ArrowLeft />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Button size="sm" variant="ghost" onClick={() => onFollowingChange(!following)}>
                {following ? <Pause /> : <Play />}
                {following ? 'Pause tail' : 'Follow tail'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onStop} disabled={!active || stopping}>
                <Square />
                Stop
            </Button>
            <Button size="sm" variant="ghost" onClick={onRestart} disabled={active || restarting}>
                <RotateCcw />
                Restart
            </Button>
            {error ? (
                <span className="text-destructive truncate text-xs" role="alert">
                    Capture session action failed.
                </span>
            ) : warning ? (
                <span className="truncate text-xs text-amber-700 dark:text-amber-400" role="status">
                    {warning}
                </span>
            ) : null}
            <div className="ml-auto flex min-w-0 items-center gap-2">
                <span
                    className={`size-1.5 rounded-full ${state === 'failed' ? 'bg-destructive' : active ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
                />
                <span className="text-muted-foreground text-xs capitalize">
                    {state ?? 'loading'}
                </span>
                <code className="text-muted-foreground hidden max-w-36 truncate text-[10px] sm:block">
                    {captureId.slice(0, 12)}
                </code>
            </div>
        </header>
    )
}

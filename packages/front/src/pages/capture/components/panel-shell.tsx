import type { ReactNode } from 'react'

export function PanelShell({
    title,
    meta,
    showHeader = true,
    children,
}: {
    title?: string
    meta?: ReactNode
    showHeader?: boolean
    children: ReactNode
}) {
    return (
        <section className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
            {showHeader ? (
                <header className="bg-muted/45 flex h-8 shrink-0 items-center justify-between border-b px-3">
                    <h2 className="text-xs font-semibold tracking-[0.1em] uppercase">{title}</h2>
                    {meta && (
                        <div className="text-muted-foreground font-mono text-xs tabular-nums">
                            {meta}
                        </div>
                    )}
                </header>
            ) : null}
            <div className="min-h-0 flex-1">{children}</div>
        </section>
    )
}

import type { ReactNode } from 'react'

export function PanelShell({
    title,
    meta,
    children,
}: {
    title: string
    meta?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="bg-background flex h-full min-h-0 flex-col overflow-hidden">
            <header className="bg-muted/35 flex h-9 shrink-0 items-center justify-between border-b px-3">
                <h2 className="text-xs font-semibold tracking-[0.12em] uppercase">{title}</h2>
                {meta && (
                    <div className="text-muted-foreground font-mono text-xs tabular-nums">
                        {meta}
                    </div>
                )}
            </header>
            <div className="min-h-0 flex-1">{children}</div>
        </section>
    )
}

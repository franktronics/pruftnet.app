import { InterfaceSelector } from './components/interface-selector'

export function HomePage() {
    return (
        <section className="space-y-4">
            <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Capture source
                </p>
                <h1 className="text-xl font-semibold tracking-tight">Network interface</h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                    Choose the local interface Pruftnet should use for scan and capture workflows.
                </p>
            </div>
            <InterfaceSelector />
        </section>
    )
}

import { useId, type ReactNode } from 'react'

import { cn } from '@repo/utils'

/** A titled list of related settings drawn as rows inside one rounded panel. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
    const titleId = useId()

    return (
        <section aria-labelledby={titleId} className="grid gap-3">
            <h2 id={titleId} className="text-[13px] font-medium">
                {title}
            </h2>
            <div className="bg-card divide-y rounded-lg border px-4">{children}</div>
        </section>
    )
}

/**
 * One setting: label and effect on the left, its control on the right. `labelId` lets
 * composite controls such as toggle groups reference the label.
 */
export function SettingRow({
    label,
    description,
    htmlFor,
    labelId,
    control,
    className,
}: {
    label: ReactNode
    description?: ReactNode
    htmlFor?: string
    labelId?: string
    control?: ReactNode
    className?: string
}) {
    const labelClassName = 'block text-[13px] font-medium'

    return (
        <div
            className={cn(
                'flex min-h-14 flex-col gap-2 py-3',
                'sm:flex-row sm:items-center sm:gap-8',
                className,
            )}
        >
            <div className="min-w-0 flex-1">
                {htmlFor ? (
                    <label id={labelId} htmlFor={htmlFor} className={labelClassName}>
                        {label}
                    </label>
                ) : (
                    <div id={labelId} className={labelClassName}>
                        {label}
                    </div>
                )}
                {description ? (
                    <p className="text-muted-foreground mt-0.5 text-xs/relaxed">{description}</p>
                ) : null}
            </div>
            {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
        </div>
    )
}

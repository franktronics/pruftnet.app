import type { ComponentProps } from 'react'

import { cn } from '@repo/utils'

/** Keeps the last two IPv6 groups visible, which is what distinguishes hosts on one prefix. */
const defaultTailLength = 9

/**
 * Truncates a single-line value in the middle so both ends stay readable. It is pure CSS: the
 * head shrinks with an ellipsis while the tail keeps its width, so it is cheap in virtual lists.
 */
function MiddleTruncate({
    value,
    tailLength = defaultTailLength,
    className,
    ...props
}: Omit<ComponentProps<'span'>, 'children'> & { value: string; tailLength?: number }) {
    const split = value.length > tailLength * 2 ? value.length - tailLength : value.length

    return (
        <span
            data-slot="middle-truncate"
            title={value}
            className={cn('flex min-w-0', className)}
            {...props}
        >
            <span className="truncate">{value.slice(0, split)}</span>
            <span className="shrink-0 whitespace-pre">{value.slice(split)}</span>
        </span>
    )
}

export { MiddleTruncate }

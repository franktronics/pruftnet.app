import { useNavigate } from '@tanstack/react-router'
import { Button } from '@repo/ui'
import { Plus } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '@repo/utils'

type NewCaptureButtonProps = {
    label?: string
    compact?: boolean
} & ComponentPropsWithoutRef<'button'>

export function NewCaptureButton({
    label = 'New Capture',
    compact = false,
    className,
    ...rest
}: NewCaptureButtonProps) {
    const navigate = useNavigate()

    return (
        <Button
            variant="outline"
            size="default"
            className={className}
            onClick={() => void navigate({ to: '/' })}
            aria-label="New capture"
            {...rest}
        >
            <Plus />
            <span className={cn(compact ? 'hidden md:inline' : undefined)}>{label}</span>
        </Button>
    )
}

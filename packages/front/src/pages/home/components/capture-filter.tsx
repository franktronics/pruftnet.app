import { InputGroup, InputGroupInput, InputGroupAddon, Button } from '@repo/ui/atoms'
import { cn } from '@repo/utils'
import { Funnel } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

export type CaptureFilterProps = {} & ComponentPropsWithoutRef<'div'>
export const CaptureFilter = (props: CaptureFilterProps) => {
    const { className, ...rest } = props

    return (
        <div className={cn('flex w-full max-w-lg items-center gap-2', className)} {...rest}>
            <InputGroup>
                <InputGroupInput placeholder="Apply display filter..." />
                <InputGroupAddon>
                    <Funnel />
                </InputGroupAddon>
            </InputGroup>

            <Button type="submit" variant="outline">
                Apply
            </Button>
        </div>
    )
}

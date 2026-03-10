import {
    InputGroup,
    InputGroupInput,
    InputGroupAddon,
    Button,
    Switch,
    Label,
    Badge,
} from '@repo/ui/atoms'
import { cn } from '@repo/utils'
import { Funnel } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'
import { useScanControlContext } from '../context/scan-control-context'

export type CaptureFilterProps = {} & ComponentPropsWithoutRef<'div'>
export const CaptureFilter = (props: CaptureFilterProps) => {
    const { className, ...rest } = props
    const { packets, autoScroll, setAutoScroll } = useScanControlContext()

    return (
        <div className={cn('flex w-full items-center gap-4', className)} {...rest}>
            <div className="flex max-w-lg flex-1 items-center gap-2">
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

            <div className="text-muted-foreground flex items-center gap-4 text-sm">
                <Badge variant="secondary" className="px-3 py-1">
                    {packets.length} Packets
                </Badge>
                <div className="flex items-center gap-2">
                    <Switch
                        id="autoscroll-switch"
                        checked={autoScroll}
                        onCheckedChange={setAutoScroll}
                    />
                    <Label htmlFor="autoscroll-switch" className="cursor-pointer text-sm">
                        Auto-scroll
                    </Label>
                </div>
            </div>
        </div>
    )
}

import { type ComponentPropsWithoutRef } from 'react'
import { Popover, PopoverTrigger, PopoverContent, Button } from '../../atoms'
import { cn, cond, Vector } from '@repo/utils'
import { Computer, Router } from 'lucide-react'

export enum DEVICE_TYPE {
    PC = 'pc',
    ROUTER = 'router',
}
export type BasicDeviceProps = {
    mac: string
    position: Vector
}
export type NetworkDeviceProps = { deviceType: DEVICE_TYPE } & BasicDeviceProps &
    ComponentPropsWithoutRef<'button'>

export const NetworkDevice = (props: NetworkDeviceProps) => {
    const { children, mac, position, deviceType, className, ...rest } = props

    return (
        <Popover>
            <PopoverTrigger
                className={cn('absolute top-1/2 left-1/2', className)}
                style={{
                    transform: `translate(${position.x}px, ${position.y}px)`,
                }}
                aria-label={'Device: ' + mac}
                {...rest}
                asChild
            >
                <div className="flex flex-col items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={deviceType}
                        className="size-14 rounded-full"
                    >
                        {cond(
                            [deviceType === DEVICE_TYPE.PC, <Computer className="size-6" />],
                            [deviceType === DEVICE_TYPE.ROUTER, <Router className="size-6" />],
                        )}
                    </Button>
                    <p>{mac}</p>
                </div>
            </PopoverTrigger>
            <PopoverContent>{children}</PopoverContent>
        </Popover>
    )
}

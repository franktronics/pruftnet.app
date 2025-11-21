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
    const GRID_SIZE = 50
    const resizedX = Math.round(position.x / GRID_SIZE) * GRID_SIZE
    const resizedY = Math.round(position.y / GRID_SIZE) * GRID_SIZE

    return (
        <Popover>
            <PopoverTrigger
                className={cn('absolute top-1/2 left-1/2 origin-center', className)}
                style={{
                    transform: `translate(${resizedX}px, ${resizedY}px)`,
                }}
                aria-label={'Device: ' + mac}
                id={'network-device-'.concat(mac)}
                {...rest}
                asChild
            >
                <div className="flex flex-col items-center gap-1">
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={deviceType}
                        className="size-12.5 rounded-full"
                    >
                        {cond(
                            [deviceType === DEVICE_TYPE.PC, <Computer className="size-6" />],
                            [deviceType === DEVICE_TYPE.ROUTER, <Router className="size-6" />],
                        )}
                    </Button>
                    <p className="absolute top-[calc(100%+0.5rem)]">{mac}</p>
                </div>
            </PopoverTrigger>
            <PopoverContent>{children}</PopoverContent>
        </Popover>
    )
}

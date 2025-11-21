import { ComponentPropsWithoutRef } from 'react'
import { BasicDeviceProps, DEVICE_TYPE, NetworkDevice } from './network-device'
import { cn } from '@repo/utils'

export type NetworkRouterData = { ip?: string }
export type NetworkRouterDeviceProps = {
    data: NetworkRouterData
} & BasicDeviceProps &
    ComponentPropsWithoutRef<'button'>

export const NetworkRouterDevice = (props: NetworkRouterDeviceProps) => {
    const { data, className, ...rest } = props
    const { ip } = data

    return (
        <NetworkDevice deviceType={DEVICE_TYPE.ROUTER} className={cn(className)} {...rest}>
            lorem ipsum dolor sit amet
        </NetworkDevice>
    )
}

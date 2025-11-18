import { ComponentPropsWithoutRef } from 'react'
import { BasicDeviceProps, DEVICE_TYPE, NetworkDevice } from './network-device'
import { cn } from '@repo/utils'

export type NetworkPcData = { ip?: string; hostname?: string }
export type NetworkPcDeviceProps = {
    data: NetworkPcData
} & BasicDeviceProps &
    ComponentPropsWithoutRef<'button'>

export const NetworkPcDevice = (props: NetworkPcDeviceProps) => {
    const { data, className, ...rest } = props
    const { ip, hostname } = data

    return (
        <NetworkDevice deviceType={DEVICE_TYPE.PC} className={cn(className)} {...rest}>
            lorem ipsum dolor sit amet
        </NetworkDevice>
    )
}

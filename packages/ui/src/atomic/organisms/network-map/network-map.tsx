import { cn } from '@repo/utils'
import { ComponentPropsWithoutRef, useEffect, useRef } from 'react'
import { NetworkMapControl } from './network-map-control'

export type NetworkMapProps = {} & ComponentPropsWithoutRef<'div'>
export const NetworkMap = (props: NetworkMapProps) => {
    const { className, ...rest } = props

    const container = useRef<HTMLDivElement>(null)
    const controlInst = useRef<NetworkMapControl>(null)

    useEffect(() => {
        if (container.current && !controlInst.current) {
            controlInst.current = new NetworkMapControl(container.current)
        }
    }, [])

    return (
        <div className={cn('overflow-hidden bg-amber-900', className)} ref={container} {...rest}>
            <div className="overflow-hidden">
                <div className="h-full w-full bg-linear-65 from-purple-500 to-pink-500">
                    network map
                </div>
            </div>
        </div>
    )
}

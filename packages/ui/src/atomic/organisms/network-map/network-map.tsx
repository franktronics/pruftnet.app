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
        <div className={cn('bg-background overflow-hidden', className)} ref={container} {...rest}>
            <div className="overflow-hidden rounded-lg">
                <div className="bg-card relative h-full w-full">
                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                        <defs>
                            <pattern
                                id="grid-pattern"
                                x="0"
                                y="0"
                                width="50"
                                height="50"
                                patternUnits="userSpaceOnUse"
                            >
                                <circle cx="0" cy="0" r="2" className="fill-muted-foreground" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-mono text-sm">
                        network map
                    </div>
                </div>
            </div>
        </div>
    )
}

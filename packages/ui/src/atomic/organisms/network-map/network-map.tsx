import { cn } from '@repo/utils'
import { ComponentPropsWithoutRef, useEffect, useRef } from 'react'
import { NetworkMapControl } from './network-map-control'

export type NetworkMapProps = {} & ComponentPropsWithoutRef<'div'>
export const NetworkMap = (props: NetworkMapProps) => {
    const { className, children, ...rest } = props

    const container = useRef<HTMLDivElement>(null)
    const controlInst = useRef<NetworkMapControl>(null)

    useEffect(() => {
        if (container.current && !controlInst.current) {
            controlInst.current = new NetworkMapControl(container.current)
        }
    }, [])

    return (
        <div
            aria-description="map-container"
            className={cn('bg-background overflow-hidden', className)}
            ref={container}
            {...rest}
        >
            <div
                aria-description="map-content"
                className="relative h-full w-full overflow-hidden rounded-lg"
            >
                <div aria-description="map-elt" className="bg-card absolute">
                    <svg className="pointer-events-none absolute inset-0 h-full w-full">
                        <defs>
                            <pattern
                                id="grid-pattern"
                                x="0"
                                y="0"
                                width="50"
                                height="50"
                                patternUnits="userSpaceOnUse"
                                className="[&>circle]:fill-muted-foreground"
                            >
                                <circle cx="0" cy="0" r="1.5" />
                                <circle cx="50" cy="0" r="1.5" />
                                <circle cx="0" cy="50" r="1.5" />
                                <circle cx="50" cy="50" r="1.5" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                    </svg>
                    <div className={cn('absolute inset-0 font-mono text-sm')}>{children}</div>
                </div>
            </div>
        </div>
    )
}

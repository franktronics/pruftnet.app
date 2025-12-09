import { cn } from '@repo/utils'
import { type CSSProperties, type ComponentPropsWithoutRef } from 'react'

type NetworkScanAnim = {
    type: 'send' | 'receive'
    nbrCircles?: number
    maxSize?: number
} & ComponentPropsWithoutRef<'div'>

export const NetworkScanAnim = (props: NetworkScanAnim) => {
    const { type, nbrCircles = 5, maxSize = 8, className, ...rest } = props

    const timingFunction =
        type === 'send' ? 'cubic-bezier(0, 0, 0.2, 1)' : 'cubic-bezier(0.8, 0, 1, 1)'

    return (
        <div
            className={cn(
                'pointer-events-none',
                '-translate-x-1/2 -translate-y-1/2',
                'absolute top-1/2 left-1/2',
                className,
            )}
            style={{ '--radar-max-size': `${maxSize}rem` } as CSSProperties}
            {...rest}
        >
            {Array.from({ length: nbrCircles }).map((_, index) => (
                <div
                    key={index}
                    aria-label={`device-anim-circle-${type}-${index}`}
                    className={cn(
                        'bg-primary/20 rounded-full opacity-0',
                        'size-(--radar-max-size)',
                        'absolute top-1/2 left-1/2',
                        'mt-[calc(var(--radar-max-size)/-2)] ml-[calc(var(--radar-max-size)/-2)]',
                    )}
                    style={{
                        animation: `radar-${type} 2s ${timingFunction} infinite`,
                        animationDelay: `${(index * 2) / nbrCircles}s`,
                    }}
                />
            ))}
        </div>
    )
}

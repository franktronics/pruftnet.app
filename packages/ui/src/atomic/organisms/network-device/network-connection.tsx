import { ComponentPropsWithoutRef, useEffect, useRef, useState } from 'react'
import { cn } from '@repo/utils'

export type NetworkConnectionProps = {
    fromMac: string
    toMac: string
    color?: string
    strokeWidth?: number
    bidirectional?: boolean
    animated?: boolean
} & Omit<ComponentPropsWithoutRef<'svg'>, 'color'>

export const NetworkConnection = (props: NetworkConnectionProps) => {
    const {
        fromMac,
        toMac,
        color = 'currentColor',
        strokeWidth = 1,
        bidirectional = false,
        animated = false,
        className,
        ...rest
    } = props

    const svgRef = useRef<SVGSVGElement>(null)
    const [line, setLine] = useState({ x1: 0, y1: 0, x2: 0, y2: 0 })
    const [arrowEndPoints, setArrowEndPoints] = useState('')
    const [arrowStartPoints, setArrowStartPoints] = useState('')

    useEffect(() => {
        const fromElement = document.getElementById('network-device-'.concat(fromMac))
        const toElement = document.getElementById('network-device-'.concat(toMac))

        if (!fromElement || !toElement || !svgRef.current) return

        const updateConnection = () => {
            const svgRect = svgRef.current!.getBoundingClientRect()
            const fromRect = fromElement.getBoundingClientRect()
            const toRect = toElement.getBoundingClientRect()

            const fromCenterX = fromRect.left + fromRect.width / 2 - svgRect.left
            const fromCenterY = fromRect.top + fromRect.height / 2 - svgRect.top
            const toCenterX = toRect.left + toRect.width / 2 - svgRect.left
            const toCenterY = toRect.top + toRect.height / 2 - svgRect.top

            const dx = toCenterX - fromCenterX
            const dy = toCenterY - fromCenterY
            const angle = Math.atan2(dy, dx)

            const deviceRadius = 28

            const x1 = fromCenterX + Math.cos(angle) * deviceRadius
            const y1 = fromCenterY + Math.sin(angle) * deviceRadius
            const x2 = toCenterX - Math.cos(angle) * deviceRadius
            const y2 = toCenterY - Math.sin(angle) * deviceRadius

            setLine({ x1, y1, x2, y2 })

            const arrowLength = 6

            // Arrow at end (toDevice)
            const angle1 = angle + Math.PI - Math.PI / 6
            const angle2 = angle + Math.PI + Math.PI / 6

            const arrowX1 = x2 + Math.cos(angle1) * arrowLength
            const arrowY1 = y2 + Math.sin(angle1) * arrowLength
            const arrowX2 = x2 + Math.cos(angle2) * arrowLength
            const arrowY2 = y2 + Math.sin(angle2) * arrowLength

            setArrowEndPoints(`${x2},${y2} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`)

            // Arrow at start (fromDevice) - if bidirectional
            if (bidirectional) {
                const reverseAngle = angle + Math.PI
                const angle3 = reverseAngle + Math.PI - Math.PI / 6
                const angle4 = reverseAngle + Math.PI + Math.PI / 6

                const arrowX3 = x1 + Math.cos(angle3) * arrowLength
                const arrowY3 = y1 + Math.sin(angle3) * arrowLength
                const arrowX4 = x1 + Math.cos(angle4) * arrowLength
                const arrowY4 = y1 + Math.sin(angle4) * arrowLength

                setArrowStartPoints(`${x1},${y1} ${arrowX3},${arrowY3} ${arrowX4},${arrowY4}`)
            }
        }

        updateConnection()

        const observer = new MutationObserver(updateConnection)

        observer.observe(fromElement, {
            attributes: true,
            attributeFilter: ['style'],
        })
        observer.observe(toElement, {
            attributes: true,
            attributeFilter: ['style'],
        })

        return () => {
            observer.disconnect()
        }
    }, [fromMac, toMac, bidirectional])

    return (
        <svg
            ref={svgRef}
            className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
            style={{ zIndex: 1 }}
            {...rest}
        >
            <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(animated && 'animate-pulse')}
            />
            <path
                d={`M ${arrowEndPoints.split(' ')[0]} L ${arrowEndPoints.split(' ')[1]} L ${arrowEndPoints.split(' ')[2]} Z`}
                fill={color}
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(animated && 'animate-pulse')}
            />
            {bidirectional && (
                <path
                    d={`M ${arrowStartPoints.split(' ')[0]} L ${arrowStartPoints.split(' ')[1]} L ${arrowStartPoints.split(' ')[2]} Z`}
                    fill={color}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(animated && 'animate-pulse')}
                />
            )}
        </svg>
    )
}

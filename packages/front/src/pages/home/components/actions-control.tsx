import { cn, cond } from '@repo/utils'
import { type ComponentPropsWithoutRef } from 'react'
import { CAPTURE_STATUS, useScanControlContext } from '../stores/scan-control.context'
import { Button, Spinner } from '@repo/ui/atoms'
import { CircleX, Play, Square } from 'lucide-react'

export type ActionsControlProps = {} & ComponentPropsWithoutRef<'section'>

export const ActionsControl = (props: ActionsControlProps) => {
    const { className, ...rest } = props
    const { captureStatus, changeCaptureStatus } = useScanControlContext()

    return (
        <section className={cn(className)} {...rest}>
            <Button
                variant={cond(
                    [captureStatus === CAPTURE_STATUS.IDLE, 'default'],
                    [captureStatus === CAPTURE_STATUS.CAPTURING, 'destructive'],
                    [captureStatus === CAPTURE_STATUS.INNITIALIZING, 'secondary'],
                    [captureStatus === CAPTURE_STATUS.ERROR, 'destructive'],
                )}
                disabled={captureStatus === CAPTURE_STATUS.INNITIALIZING}
                size="sm"
                onClick={() => {
                    if (
                        captureStatus === CAPTURE_STATUS.IDLE ||
                        captureStatus === CAPTURE_STATUS.ERROR
                    ) {
                        changeCaptureStatus(CAPTURE_STATUS.INNITIALIZING)
                    } else if (captureStatus === CAPTURE_STATUS.CAPTURING) {
                        changeCaptureStatus(CAPTURE_STATUS.IDLE)
                    }
                }}
            >
                {cond(
                    [captureStatus === CAPTURE_STATUS.IDLE, <Play />],
                    [captureStatus === CAPTURE_STATUS.CAPTURING, <Square />],
                    [
                        captureStatus === CAPTURE_STATUS.INNITIALIZING,
                        <Spinner className="animate-[spin_0.3s_linear_infinite]" />,
                    ],
                    [captureStatus === CAPTURE_STATUS.ERROR, <CircleX />],
                )}{' '}
                {cond(
                    [captureStatus === CAPTURE_STATUS.IDLE, 'Start capture'],
                    [captureStatus === CAPTURE_STATUS.CAPTURING, 'Stop capture'],
                    [captureStatus === CAPTURE_STATUS.INNITIALIZING, 'Initializing ...'],
                    [captureStatus === CAPTURE_STATUS.ERROR, 'Retry capture'],
                )}
            </Button>
        </section>
    )
}

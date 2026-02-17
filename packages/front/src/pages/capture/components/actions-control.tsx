import { cn, cond } from '@repo/utils'
import { type ComponentPropsWithoutRef } from 'react'
import { CAPTURE_STATUS, useScanControlContext } from '../context/scan-control-context'
import { Button, Spinner } from '@repo/ui/atoms'
import { Popup } from '@repo/ui/organisms'
import { CircleX, Loader, Play, Square } from 'lucide-react'

export type ActionsControlProps = {} & ComponentPropsWithoutRef<'section'>

export const ActionsControl = (props: ActionsControlProps) => {
    const { className, ...rest } = props
    const { captureStatus, changeCaptureStatus, interf, packetsEmpty, cleanupPackets } =
        useScanControlContext()

    const handleBtnClick = () => {
        if (captureStatus === CAPTURE_STATUS.IDLE || captureStatus === CAPTURE_STATUS.ERROR) {
            changeCaptureStatus(CAPTURE_STATUS.INNITIALIZING)
        } else if (captureStatus === CAPTURE_STATUS.CAPTURING) {
            changeCaptureStatus(CAPTURE_STATUS.IDLE)
        }
    }

    const btnDisabled = interf.name === '' || captureStatus === CAPTURE_STATUS.INNITIALIZING
    const displayPopup =
        !packetsEmpty &&
        (captureStatus === CAPTURE_STATUS.IDLE || captureStatus === CAPTURE_STATUS.ERROR)

    return (
        <section className={cn(className)} {...rest}>
            <Popup
                title="Clear Capture Data"
                description="Confirm that you want to clear the existing capture data."
                trigger={
                    <ActionBtn
                        captureStatus={captureStatus}
                        btnDisabled={btnDisabled}
                        onHandleBtnClick={handleBtnClick}
                    />
                }
                onConfirm={async () => {
                    return await cleanupPackets()
                }}
                blockOpening={!displayPopup}
                btnCloseText="Cancel"
                btnSaveText="Confirm"
            >
                <p className="text-sm">
                    Starting a new capture will clear all existing captured data. If you wish to
                    keep the current data, please export it before proceeding.
                </p>
            </Popup>
        </section>
    )
}

type ActionBtnProps = {
    captureStatus: CAPTURE_STATUS
    btnDisabled: boolean
    onHandleBtnClick?: () => void
} & ComponentPropsWithoutRef<'button'>
const ActionBtn = (props: ActionBtnProps) => {
    const { captureStatus, btnDisabled, onHandleBtnClick, ...rest } = props
    return (
        <Button
            variant={cond(
                [captureStatus === CAPTURE_STATUS.IDLE, 'default'],
                [captureStatus === CAPTURE_STATUS.CAPTURING, 'destructive'],
                [captureStatus === CAPTURE_STATUS.INNITIALIZING, 'secondary'],
                [captureStatus === CAPTURE_STATUS.ERROR, 'destructive'],
            )}
            disabled={btnDisabled}
            onClick={onHandleBtnClick}
            {...rest}
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
            {captureStatus === CAPTURE_STATUS.CAPTURING ? (
                <Loader className="animate-[spin_0.5s_linear_infinite]" size={16} />
            ) : null}
        </Button>
    )
}

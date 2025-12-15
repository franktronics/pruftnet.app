import { createContext, useCallback, useContext, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { wsFetcher, fetcher } from '../../../config/client-trpc'
import { ClientErrorParser, useMutateFetcher } from '@repo/utils'
import { toast } from '@repo/ui/atoms'

export const CAPTURE_STATUS = {
    IDLE: 'IDLE',
    CAPTURING: 'CAPTURING',
    INNITIALIZING: 'INNITIALIZING',
    ERROR: 'ERROR',
} as const
export type CAPTURE_STATUS = (typeof CAPTURE_STATUS)[keyof typeof CAPTURE_STATUS]

export type ScanControlContextType = {
    captureStatus: CAPTURE_STATUS
    changeCaptureStatus: (capturing: CAPTURE_STATUS) => void
    rawPackets: { parsed: any; raw: any; id: number }[]
}

const ScanControlContext = createContext<ScanControlContextType | undefined>(undefined)

export const useScanControlContext = () => {
    const context = useContext(ScanControlContext)
    if (context === undefined) {
        throw new Error('useScanControl must be used within a ScanControlProvider')
    }
    return context
}

type ScanControlProviderProps = {} & ComponentPropsWithoutRef<'div'>
export const ScanControlProvider = (props: ScanControlProviderProps) => {
    const { children, ...rest } = props
    const [captureStatus, setCaptureStatus] = useState<CAPTURE_STATUS>(CAPTURE_STATUS.IDLE)

    const [rawPackets, setRawPackets] = useState<{ parsed: any; raw: any; id: number }[]>([])
    const { mutateData: stopScan } = useMutateFetcher({
        procedure: fetcher.scan.stop.mutate({}, 'DELETE'),
        popupOnFetching: {
            fetching: 'Stopping scan...',
            success: 'Scan stopped successfully',
        },
        popupOnError: true,
    })

    const handleChangeCaptureStatus = useCallback(async (status: CAPTURE_STATUS) => {
        if (status === CAPTURE_STATUS.IDLE) {
            await stopScan()
            setCaptureStatus(CAPTURE_STATUS.IDLE)
        } else if (status === CAPTURE_STATUS.INNITIALIZING) {
            wsFetcher.scan.start.handle(
                { interface: 'lo' },
                {
                    onmessage: (data) => {
                        console.log('Received from ws echo:', data)
                    },
                    onerror: (error) => {
                        toast.error(<ClientErrorParser error={error} />, {
                            duration: 5000,
                        })
                    },
                },
            )
            setCaptureStatus(CAPTURE_STATUS.CAPTURING)
        }
    }, [])

    const value: ScanControlContextType = {
        captureStatus,
        changeCaptureStatus: handleChangeCaptureStatus,
        rawPackets,
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

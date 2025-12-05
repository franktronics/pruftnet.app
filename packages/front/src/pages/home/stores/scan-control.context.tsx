import { createContext, useCallback, useContext, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { fetcher, wsFetcher } from '../../../config/client-trpc'
import { useQueryFetcher } from '@repo/utils'

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

    const { data, error, fetchData } = useQueryFetcher({
        procedure: fetcher.scan.start.query({ id: 'test-1' }),
        queryKey: ['scan', 'start'],
        popupOnFetching: {
            fetching: 'Starting scan...',
            success: 'Scan started successfully!',
        },
    })

    const handleChangeCaptureStatus = useCallback(async (status: CAPTURE_STATUS) => {
        setCaptureStatus(status)

        wsFetcher.test.echo.handle({ message: `Status changed to ${status}` }, (data) => {
            console.log('Received from WS echo:', data)
        })
    }, [])

    const value: ScanControlContextType = {
        captureStatus,
        changeCaptureStatus: handleChangeCaptureStatus,
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

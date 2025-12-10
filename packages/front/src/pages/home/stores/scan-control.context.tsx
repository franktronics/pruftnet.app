import { createContext, useCallback, useContext, useState } from 'react'
import type { ComponentPropsWithoutRef } from 'react'
import { fetcher, wsFetcher } from '../../../config/client-trpc'
import { ClientErrorParser, useQueryFetcher } from '@repo/utils'
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

    /*const { data, error, fetchData } = useQueryFetcher({
        procedure: fetcher.scan.start.query({ id: 'test-1' }),
        queryKey: ['scan', 'start'],
        popupOnFetching: {
            fetching: 'Starting scan...',
            success: 'Scan started successfully!',
        },
    })*/

    const handleChangeCaptureStatus = useCallback(async (status: CAPTURE_STATUS) => {
        let counter = 0
        if (status === CAPTURE_STATUS.IDLE) {
            wsFetcher.network_sniffer.stop.handle(
                {},
                {
                    onmessage: (data) => {
                        console.log('Sniffer stopped via ws:', data, counter)
                        setCaptureStatus(CAPTURE_STATUS.IDLE)
                    },
                    onerror: (error) => {
                        toast.error(<ClientErrorParser error={error} />, {
                            duration: 5000,
                        })
                    },
                },
            )
        } else if (status === CAPTURE_STATUS.INNITIALIZING) {
            wsFetcher.network_sniffer.start.handle(
                { interface: 'lo' },
                {
                    onmessage: (data) => {
                        console.log('Received from ws echo:', data, counter)
                        counter += 1
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
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

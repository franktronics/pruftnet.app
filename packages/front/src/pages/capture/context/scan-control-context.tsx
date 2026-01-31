import { createContext, useCallback, useContext, useState } from 'react'
import type { ComponentPropsWithoutRef, Dispatch, SetStateAction } from 'react'
import { wsFetcher, fetcher } from '../../../config/client-trpc'
import { ClientErrorParser, queryClient, useMutateFetcher } from '@repo/utils'
import { toast } from '@repo/ui/atoms'
import type {
    AnalysisSummary,
    NetworkInterfaceInfo,
    PacketDataWithoutRaw,
} from '@repo/core-node/types'

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
    packets: { parsed: any; raw: any; id: number }[]
    cleanupPackets: () => Promise<boolean>
    packetsEmpty: boolean
    interf: ContextNetinterface
    setInterface: Dispatch<SetStateAction<ContextNetinterface>>
    selectedAnalysis: AnalysisSummary | null
    setSelectedAnalysis: Dispatch<SetStateAction<AnalysisSummary | null>>
}

export type ContextNetinterface = {
    name: string
    infos: NetworkInterfaceInfo[]
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
    const [interf, setInterface] = useState<ContextNetinterface>({ name: '', infos: [] })
    const [packets, setPackets] = useState<PacketDataWithoutRaw[]>([])
    const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisSummary | null>(null)

    const { mutateData: stopScan } = useMutateFetcher({
        procedure: fetcher.scan.stop,
        method: 'DELETE',
        popupOnFetching: {
            fetching: 'Stopping scan...',
            success: 'Scan stopped successfully',
        },
        popupOnError: true,
    })
    const { mutateData: cleanupScan } = useMutateFetcher({
        procedure: fetcher.scan.cleanup,
        method: 'DELETE',
        popupOnFetching: {
            fetching: 'Cleaning up scan...',
            success: 'Scan cleaned up successfully',
        },
        popupOnError: true,
    })

    const cleanup = async () => {
        await cleanupScan({})
        await queryClient.invalidateQueries({ queryKey: ['packet'] })
        setPackets([])
        setCaptureStatus(CAPTURE_STATUS.IDLE)
        return true
    }

    const handleChangeCaptureStatus = useCallback(
        async (status: CAPTURE_STATUS) => {
            if (interf.name === '') {
                toast.warning('Select an interface')
                return
            }
            if (status === CAPTURE_STATUS.IDLE) {
                await stopScan({})
                setCaptureStatus(CAPTURE_STATUS.IDLE)
            } else if (status === CAPTURE_STATUS.INNITIALIZING) {
                setPackets([])
                wsFetcher.scan.start.handle(
                    { interface: interf.name, analysisId: selectedAnalysis?.id },
                    {
                        onmessage: (data: PacketDataWithoutRaw) => {
                            setPackets((old) => [...old, data])
                        },
                        onerror: (error) => {
                            setCaptureStatus(CAPTURE_STATUS.ERROR)
                            toast.error(<ClientErrorParser error={error} />, {
                                duration: 5000,
                            })
                        },
                    },
                )
                setCaptureStatus(CAPTURE_STATUS.CAPTURING)
            }
        },
        [interf.name],
    )

    const value: ScanControlContextType = {
        captureStatus,
        changeCaptureStatus: handleChangeCaptureStatus,
        cleanupPackets: cleanup,
        packets,
        packetsEmpty: packets.length === 0,
        interf,
        setInterface,
        selectedAnalysis,
        setSelectedAnalysis,
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

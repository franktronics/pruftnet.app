import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef, Dispatch, SetStateAction } from 'react'
import { wsFetcher, fetcher } from '../../../config/client-trpc'
import { ClientErrorParser, queryClient, useMutateFetcher } from '@repo/utils'
import { toast } from '@repo/ui/atoms'
import type {
    AnalysisSummary,
    NetworkInterfaceInfo,
    PacketDataWithoutRaw,
    SniffingEvent,
    WorkflowEvent,
} from '@repo/core-node/types'
import { useNetworkAnalyzer } from '../utils/network-analyzer'

export const CAPTURE_STATUS = {
    IDLE: 'IDLE',
    CAPTURING: 'CAPTURING',
    INNITIALIZING: 'INNITIALIZING',
    STOPPING: 'STOPPING',
    ERROR: 'ERROR',
} as const
export type CAPTURE_STATUS = (typeof CAPTURE_STATUS)[keyof typeof CAPTURE_STATUS]

export type ScanControlContextType = {
    captureStatus: CAPTURE_STATUS
    changeCaptureStatus: () => void
    packets: { parsed: any; raw: any; id: number }[]
    cleanupPackets: () => Promise<boolean>
    packetsEmpty: boolean
    interf: ContextNetinterface
    setInterface: Dispatch<SetStateAction<ContextNetinterface>>
    selectedAnalysis: AnalysisSummary | null
    setSelectedAnalysis: Dispatch<SetStateAction<AnalysisSummary | null>>
    startWorkflow: () => void
    workflowEvents: WorkflowEvent[]

    analyzer: {
        devices: ReturnType<typeof useNetworkAnalyzer>['devices']
        connections: ReturnType<typeof useNetworkAnalyzer>['connections']
        vendorOui: ReturnType<typeof useNetworkAnalyzer>['vendorOui']
    }
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
    const closeConnectionFct = useRef<() => void>(null)
    const [wokflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([])
    const { registerPacket, devices, connections, vendorOui } = useNetworkAnalyzer()

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
        setWorkflowEvents([])
        setCaptureStatus(CAPTURE_STATUS.IDLE)
        return true
    }

    const handleChangeCaptureStatus = useCallback(async () => {
        if (interf.name === '') {
            toast.warning('Select an interface')
            return
        }
        switch (captureStatus) {
            case CAPTURE_STATUS.IDLE:
            case CAPTURE_STATUS.ERROR:
                setCaptureStatus(CAPTURE_STATUS.INNITIALIZING)
                setPackets([])
                const { closeConnection } = await wsFetcher.scan.start.handle(
                    { interface: interf.name },
                    {
                        onmessage: (data: SniffingEvent) => {
                            if (data.type === 'packet') {
                                setPackets((old) => [...old, data])
                                registerPacket(data)
                            } else if (data.type === 'error') {
                                setCaptureStatus(CAPTURE_STATUS.ERROR)
                                toast.error(data.message, {
                                    duration: 5000,
                                })
                                closeConnection()
                            } else if (data.type === 'start') {
                                setCaptureStatus(CAPTURE_STATUS.CAPTURING)
                            }
                        },
                        onerror: (error) => {
                            setCaptureStatus(CAPTURE_STATUS.ERROR)
                            toast.error(<ClientErrorParser error={error} />, {
                                duration: 5000,
                            })
                            closeConnection()
                        },
                    },
                )
                closeConnectionFct.current = closeConnection
                setCaptureStatus(CAPTURE_STATUS.CAPTURING)
                break
            case CAPTURE_STATUS.CAPTURING:
                setCaptureStatus(CAPTURE_STATUS.STOPPING)
                await stopScan({})
                if (closeConnectionFct.current) closeConnectionFct.current()
                setCaptureStatus(CAPTURE_STATUS.IDLE)
                break
        }
    }, [interf.name, selectedAnalysis, stopScan])

    const handleStartWorkflow = useCallback(async () => {
        if (!selectedAnalysis) return

        const { closeConnection } = await wsFetcher.analysis.startWorkflow.handle(
            { interface: interf.name, analysisId: selectedAnalysis.id },
            {
                onmessage: (data) => {
                    setWorkflowEvents((old) => [...old, data])
                },
                onerror: (error) => {
                    toast.error(<ClientErrorParser error={error} />, {
                        duration: 5000,
                    })
                    closeConnection()
                },
            },
        )
    }, [interf.name, selectedAnalysis])

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
        startWorkflow: handleStartWorkflow,
        workflowEvents: wokflowEvents,
        analyzer: {
            devices,
            connections,
            vendorOui,
        },
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

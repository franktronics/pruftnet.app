import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ComponentPropsWithoutRef, Dispatch, SetStateAction } from 'react'
import { wsFetcher, fetcher } from '../../../config/client-trpc'
import { ClientErrorParser, queryClient, useMutateFetcher, type HostBaseData } from '@repo/utils'
import { toast } from '@repo/ui/atoms'
import type {
    AnalysisSummary,
    NetworkInterfaceInfo,
    PacketDataWithoutRaw,
    SniffingEvent,
    WorkflowEvent,
} from '@repo/core-node/types'

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
    autoScroll: boolean
    setAutoScroll: Dispatch<SetStateAction<boolean>>
    hostData: Map<string, HostBaseData>
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
    const [autoScroll, setAutoScroll] = useState<boolean>(true)
    const closeConnectionFct = useRef<() => void>(null)
    const [wokflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([])

    const fakeHostDataMap = new Map<string, HostBaseData>([
        [
            '00:11:22:33:44:55',
            {
                type: 'router',
                mac: '00:11:22:33:44:55',
                ipv4: '192.168.2.1',
                vendor: 'VendorA',
                connectedTo: {
                    '66:77:88:99:AA:BB': {
                        numPacketsReceived: 10,
                        numPacketsSend: 5,
                    },
                    'AA:BB:CC:DD:EE:FF': {
                        numPacketsReceived: 2,
                        numPacketsSend: 2,
                    },
                },
            },
        ],
        [
            '66:77:88:99:AA:BB',
            {
                type: 'me',
                mac: '66:77:88:99:AA:BB',
                ipv4: '192.168.2.1',
                vendor: 'VendorB',
                connectedTo: {
                    '00:11:22:33:44:55': {
                        numPacketsReceived: 5,
                        numPacketsSend: 10,
                    },
                },
            },
        ],
        [
            'AA:BB:CC:DD:EE:FF',
            {
                type: 'host',
                mac: 'AA:BB:CC:DD:EE:FF',
                ipv6: 'fe80::1',
                vendor: 'VendorC',
                connectedTo: {
                    '00:11:22:33:44:55': {
                        numPacketsReceived: 2,
                        numPacketsSend: 2,
                    },
                },
            },
        ],
    ])
    const [hostData, setHostData] = useState<Map<string, HostBaseData>>(new Map())

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
                                setPackets((old) => [...old, data.packet])
                                if (data.hostUpdates.length > 0) {
                                    setHostData(
                                        (old) =>
                                            new Map([
                                                ...old,
                                                ...data.hostUpdates.map(
                                                    (ob) => [ob.mac, ob] as const,
                                                ),
                                            ]),
                                    )
                                }
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
        autoScroll,
        setAutoScroll,
        hostData,
    }

    return (
        <ScanControlContext.Provider value={value} {...rest}>
            {children}
        </ScanControlContext.Provider>
    )
}

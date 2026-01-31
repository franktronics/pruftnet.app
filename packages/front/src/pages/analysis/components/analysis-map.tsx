import { AnalysisGraph } from '@repo/ui/organisms'
import { cn, useMutateFetcher, type Edge, type Node, type ReactFlowJsonObject } from '@repo/utils'
import { type ComponentProps } from 'react'
import { fetcher } from '../../../config/client-trpc'

export type AnalysisMapProps = {} & ComponentProps<'div'>

const initialNodes: Node[] = [
    {
        id: 'network-source',
        position: { x: -400, y: 0 },
        type: 'net-source',
        data: { name: 'Network Source' },
    },
    {
        id: 'network-output',
        position: { x: 400, y: 0 },
        type: 'net-output',
        data: { name: 'Network Output' },
    },
    {
        id: 'ip-range',
        position: { x: 0, y: -200 },
        type: 'ip-range',
        data: { name: 'ARP Ip range', startIp: '', endIp: '' },
    },
    {
        id: 'arp-scan',
        position: { x: 0, y: 200 },
        type: 'arp-scan',
        data: { name: 'ARP Scan', delay: 0 },
    },
]

export const AnalysisMap = (props: AnalysisMapProps) => {
    const { className, ...rest } = props

    const { mutateData: updateSettings, isPending: savingGraph } = useMutateFetcher({
        procedure: fetcher.analysis.store,
        popupOnFetching: {
            fetching: 'Saving graph...',
            success: 'Settings updated successfully.',
        },
        popupOnError: true,
    })

    const handleSave = async (instance: ReactFlowJsonObject<Node, Edge>) => {
        await updateSettings({
            analysisId: 'example-analysis-id',
            data: instance,
        })
    }

    return (
        <section className={cn('h-full w-full', className)} {...rest}>
            <AnalysisGraph
                className="h-full w-full"
                initialNodes={initialNodes}
                onSave={handleSave}
            />
        </section>
    )
}

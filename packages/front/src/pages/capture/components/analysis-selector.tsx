import {
    Button,
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@repo/ui/atoms'
import { cn, useQueryFetcher } from '@repo/utils'
import { ChevronRight, X } from 'lucide-react'
import { useMemo, useState, type ComponentProps } from 'react'
import { fetcher } from '../../../config/client-trpc'
import type { AnalysisSummary } from '@repo/core-node/types'
import { useScanControlContext } from '../context/scan-control-context'

export type AnalysisSelectorProps = {} & ComponentProps<'div'>

export const AnalysisSelector = (props: AnalysisSelectorProps) => {
    const { className, ...rest } = props
    const [open, setOpen] = useState(false)

    const { selectedAnalysis, setSelectedAnalysis } = useScanControlContext()

    const { data } = useQueryFetcher({
        procedure: fetcher.analysis.list.query({}),
        enabled: open,
        retry: 0,
        popupOnError: true,
        queryKey: ['analysis_list'],
        staleTime: Infinity,
    })

    return (
        <div className={cn('flex items-center gap-1', className)} {...rest}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button variant="secondary" className="group">
                        {selectedAnalysis === null
                            ? 'Add an analysis'
                            : selectedAnalysis.title.slice(0, 20)}
                        {selectedAnalysis?.title.length! > 20 ? '...' : ''}
                        <ChevronRight
                            className={cn(
                                'size-4 rotate-0 transition-transform duration-200',
                                'group-data-[state=open]:rotate-90',
                            )}
                        />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 space-y-2 px-2 py-4">
                    {!!data ? (
                        data.map((elt) => (
                            <SelectAnalysisCard
                                key={elt.id}
                                data={elt}
                                onClick={() => {
                                    setSelectedAnalysis(elt)
                                    setOpen(false)
                                }}
                            />
                        ))
                    ) : (
                        <p>Loading...</p>
                    )}
                </PopoverContent>
            </Popover>
            {selectedAnalysis !== null ? (
                <Button onClick={() => setSelectedAnalysis(null)} size="icon" variant="secondary">
                    <X />
                </Button>
            ) : null}
        </div>
    )
}

type SelectAnalysisCardProps = {
    data: AnalysisSummary
} & ComponentProps<typeof Card>
const SelectAnalysisCard = (props: SelectAnalysisCardProps) => {
    const { data, className, ...rest } = props
    const { title, description, updatedAt } = data

    const updateDateLabel = useMemo(() => {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(updatedAt))
    }, [updatedAt])

    return (
        <Card
            className={cn(
                'group border-border/70 hover:border-primary/40 p-0 shadow-none',
                'w-full cursor-pointer rounded transition-colors',
                className,
            )}
            {...rest}
        >
            <CardHeader className="flex justify-between gap-4 p-4">
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <p className="text-muted-foreground text-xs">
                        Last modified: {updateDateLabel}
                    </p>
                </div>
            </CardHeader>
        </Card>
    )
}

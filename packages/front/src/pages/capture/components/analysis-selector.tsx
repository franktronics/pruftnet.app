import {
    Button,
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    FieldTitle,
    Popover,
    PopoverContent,
    PopoverTrigger,
    RadioGroup,
    RadioGroupItem,
} from '@repo/ui/atoms'
import { cn, useQueryFetcher } from '@repo/utils'
import { ChevronRight, X } from 'lucide-react'
import { useId, useMemo, useState, type ComponentProps } from 'react'
import { fetcher } from '../../../config/client-trpc'
import type { AnalysisSummary } from '@repo/core-node/types'
import { useScanControlContext } from '../context/scan-control-context'

export type AnalysisSelectorProps = {} & ComponentProps<'div'>

export const AnalysisSelector = (props: AnalysisSelectorProps) => {
    const { className, ...rest } = props
    const [open, setOpen] = useState(false)

    const { selectedAnalysis, setSelectedAnalysis, captureStatus, startWorkflow, interf } =
        useScanControlContext()

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
            <Popover open={open && captureStatus !== 'CAPTURING'} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="secondary"
                        className="group flex min-w-30 items-center justify-between"
                    >
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
                <PopoverContent
                    align="start"
                    className="scrollbar-thin max-h-100 w-80 space-y-2 overflow-auto px-2 py-4"
                >
                    {!!data ? (
                        <RadioGroup
                            className="max-w-sm"
                            value={selectedAnalysis?.id?.toString() ?? ''}
                            onValueChange={(value) => {
                                const analysis = data.find((elt) => elt.id.toString() === value)
                                if (analysis) {
                                    setSelectedAnalysis(analysis)
                                }
                            }}
                        >
                            {data.map((elt) => (
                                <SelectAnalysisCard key={elt.id} data={elt} />
                            ))}
                        </RadioGroup>
                    ) : (
                        <p>Loading...</p>
                    )}
                </PopoverContent>
            </Popover>
            {selectedAnalysis !== null && captureStatus !== 'CAPTURING' ? (
                <Button onClick={() => setSelectedAnalysis(null)} size="icon" variant="secondary">
                    <X />
                </Button>
            ) : null}
            {captureStatus !== 'CAPTURING' ? (
                <Button
                    onClick={() => startWorkflow()}
                    variant="secondary"
                    aria-label="Select an analysis and start workflow"
                    disabled={!selectedAnalysis || interf.name === ''}
                >
                    Run workflow
                </Button>
            ) : null}
        </div>
    )
}

type SelectAnalysisCardProps = {
    data: AnalysisSummary
} & ComponentProps<typeof FieldLabel>
const SelectAnalysisCard = (props: SelectAnalysisCardProps) => {
    const { data, className, ...rest } = props
    const { id, title, description, updatedAt } = data
    const fieldId = useId()

    const updateDateLabel = useMemo(() => {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(updatedAt))
    }, [updatedAt])

    return (
        <FieldLabel htmlFor={fieldId} {...rest}>
            <Field orientation="horizontal">
                <FieldContent>
                    <FieldTitle>{title}</FieldTitle>
                    <FieldDescription>{description}</FieldDescription>
                    <div>
                        <p className="text-muted-foreground text-xs">
                            Last modified: {updateDateLabel}
                        </p>
                    </div>
                </FieldContent>
                <RadioGroupItem value={id.toString()} id={fieldId} />
            </Field>
        </FieldLabel>
    )
}
